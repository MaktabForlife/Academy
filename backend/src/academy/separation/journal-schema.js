// Technical recovery records, local to each writing store. No third records
// database, cloned credential table or manual-assessment case workflow.
const phases="'PREPARING','PENDING','APPLIED','COMMITTED','ABORTING','ROLLED_BACK','ABORTED','DONE'";
export function journalDDL(owner,tables=[],part='all'){
 const base=`CREATE TABLE split_commands(command_id TEXT PRIMARY KEY,phase TEXT NOT NULL CHECK(phase IN(${phases})),payload_hash TEXT NOT NULL,proof_json TEXT,created_at TEXT NOT NULL,error_code TEXT);
CREATE TABLE split_command_parts(command_id TEXT NOT NULL REFERENCES split_commands(command_id),part_index INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(command_id,part_index));
CREATE TABLE split_transaction_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));`;
 const reject="CREATE TRIGGER split_transaction_guard_reject BEFORE INSERT ON split_transaction_guards WHEN NEW.accepted<>1 BEGIN SELECT RAISE(ABORT,'split_transaction_state'); END;";
 if(owner==='admin')return part==='tables'?base:part==='triggers'?reject:base+reject;
 const guards=tables.filter(n=>!n.startsWith('split_')&&n!=='academy_write_guards').flatMap(table=>['INSERT','UPDATE','DELETE'].flatMap(verb=>[`CREATE TRIGGER split_fence_${table}_${verb.toLowerCase()} BEFORE ${verb} ON "${table}" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;`,`CREATE TRIGGER split_epoch_${table}_${verb.toLowerCase()} AFTER ${verb} ON "${table}" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;`]));
 const definitions=base+`CREATE TABLE split_write_fence(singleton INTEGER PRIMARY KEY CHECK(singleton=1),command_id TEXT NOT NULL UNIQUE REFERENCES split_commands(command_id),allow_write INTEGER NOT NULL DEFAULT 0 CHECK(allow_write IN(0,1)));
CREATE TABLE split_read_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL);`,triggers=reject+guards.join('\n')+`CREATE TRIGGER split_new_actor AFTER INSERT ON accounts BEGIN INSERT INTO actor_refs(account_id) VALUES(NEW.account_id) ON CONFLICT DO NOTHING; END;`;
 return part==='tables'?definitions:part==='triggers'?triggers:definitions+triggers;
}
