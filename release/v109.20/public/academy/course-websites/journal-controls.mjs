// Optional integration with the separately released private student journal.
// This reader never implements its own journal store or uploads on navigation.
export function createJournalControls({eligible,available=false,ui,activityKey,surahId,read,write,active=()=>true,onEnded=()=>{},load=()=>import('../journal/reflections.mjs'),launch=url=>location.assign(url)}){
 let provider=null,opening=null,stopped=false;
 ui.journalEligible=Boolean(eligible);ui.journalEnabled=false;
 const current=()=>!stopped&&active();
 const ready=()=>current()&&eligible&&available;
 return {
  async sync(course){
   if(!ready())return;
   try{
    opening??=load().then(module=>{
     if(!current())return null;
     provider=module.reflectionJournal({enabled:true,ui,activityKey,surahId,read,write,onEnded});
     return provider;
    });
    const journal=await opening;if(!current()||!journal)return;
    await journal.sync(course);
   }catch{
    if(current()){ui.journalEnabled=false;ui.journalStatus={};}
    opening=null;
   }
  },
  change(id,value){if(current())provider?.change(id,value);},
  async save(id){
   if(!current()||!provider||!ui.journalEnabled)throw Error('Your personal journal is not available yet. Your browser draft is kept.');
   await provider.save(id);
  },
  open(id){
   if(!current()||!provider||!ui.journalEnabled)return false;
   if(!provider.canLeave())throw Error('Please wait for your device draft to finish saving.');
   const entry=ui.journalEntryIds?.[id];
   launch('/academy/journal/?workspace=LEARN'+(entry?'&entry='+encodeURIComponent(entry):''));
   return true;
  },
  canLeave(){return !provider||provider.canLeave();},
  stop(options={}){stopped=true;ui.journalEnabled=false;return provider?.stop(options);}
 };
}
