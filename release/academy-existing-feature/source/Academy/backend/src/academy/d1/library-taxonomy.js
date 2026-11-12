import {buildOpenLibraryTaxonomy} from '../../lib/open-library-taxonomy-model.js';
import {d1OpenLibraryTaxonomySource} from './open-library-taxonomy.js';
export async function loadOpenLibraryTaxonomy(env){return {...buildOpenLibraryTaxonomy(await d1OpenLibraryTaxonomySource(env)),warnings:[]};}
export {resolveOpenLibraryTaxonomySelection} from '../../lib/open-library-taxonomy-model.js';
