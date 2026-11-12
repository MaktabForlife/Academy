import {DurableObject} from 'cloudflare:workers';
import {openLibraryMetadataUser} from './library-metadata.js';
import {loadOpenLibraryTaxonomy,resolveOpenLibraryTaxonomySelection} from './library-taxonomy.js';
import {validateOpenLibraryMetadata,publicOpenLibraryMetadata,isAcademyLinkId} from '../../lib/open-library-metadata.js';
import {problem} from '../../programs/model.js';
// Preserve this deployed class identity and all existing records.
export class ProgramTimetableCoordinator extends DurableObject {
  constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS open_library_metadata (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)');}
  openLibraryMetadataList() {
    return this.ctx.storage.sql.exec('SELECT metadata, revision FROM open_library_metadata ORDER BY id').toArray().map(publicOpenLibraryMetadata);
  }
  openLibraryMetadataCoverKey(id) {
    const row = this.ctx.storage.sql.exec('SELECT metadata FROM open_library_metadata WHERE id = ?', id).toArray()[0];
    const record = row ? JSON.parse(row.metadata) : null;
    return record?.kind === 'LINK' && record.active === false ? '' : record?.coverKey || '';
  }
  async openLibraryMetadataSave(input, authorization, uploadedCoverKey = '') {
    const request=new Request('https://internal.invalid/open-library-metadata', {
      headers: { Authorization: authorization, 'X-Academy-Workspace':'ADMIN' }
    });
    let user=await openLibraryMetadataUser(request,this.env);
    const taxonomy = await loadOpenLibraryTaxonomy(this.env);
    const creatingLink = input?.kind === 'LINK' && !input.id;
    const id = creatingLink ? `EXTERNAL:ACADEMY_LINK:${crypto.randomUUID()}` : input?.id;
    const record = validateOpenLibraryMetadata({ ...input, id,
      ...resolveOpenLibraryTaxonomySelection(input, taxonomy) });
    const expected = Number(input?.baseRevision);
    if (!Number.isInteger(expected) || expected < 0) throw problem('Refresh the book details before saving.', 409);
    // Taxonomy loading yields. Recheck the D1 session after it, immediately
    // before the existing synchronous metadata compare-and-set write.
    user=await openLibraryMetadataUser(request,this.env);
    const sql = this.ctx.storage.sql;
    const current = sql.exec('SELECT metadata, revision FROM open_library_metadata WHERE id = ?', record.id).toArray()[0];
    const revision = Number(current?.revision || 0);
    if (isAcademyLinkId(record.id) && !creatingLink && !current) throw problem('This Library link no longer exists.', 404);
    if (creatingLink && expected !== 0) throw problem('Refresh the Library editor before adding a link.', 409);
    if (revision !== expected) throw problem('This book changed elsewhere. Refresh its details before saving.', 409);
    const previous = current ? JSON.parse(current.metadata) : {};
    if (current && Boolean(previous.kind === 'LINK') !== Boolean(record.kind === 'LINK')) {
      throw problem('The resource type cannot be changed after creation.');
    }
    record.coverKey = uploadedCoverKey || (record.coverUrl || input.removeCover === true ? '' : previous.coverKey || '');
    const next = revision + 1;
    const changed = sql.exec(`INSERT INTO open_library_metadata (id, metadata, revision, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, revision = excluded.revision,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
      WHERE open_library_metadata.revision = ?`,
      record.id, JSON.stringify(record), next, new Date().toISOString(), user.accountid, expected);
    if (!changed.rowsWritten) throw problem('This book changed elsewhere. Refresh its details before saving.', 409);
    return { ...record, revision: next, previousCoverKey: previous.coverKey && previous.coverKey !== record.coverKey ? previous.coverKey : '' };
  }
}
