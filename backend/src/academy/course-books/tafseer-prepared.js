// Private, immutable import packages. Reading one never publishes a website.
export const preparedTafseerCopies=Object.freeze({
 "foundations": {
  "sha256": "55f8dbec4cffc53b727f8877a5f5064a73ef270693b1c728141e7a60cda1cbd2",
  "size": 2005821
 },
 "yaseen": {
  "sha256": "80fdd7a69ed323872037dbbc7771900f349aefc757416b27b8970c782947e27e",
  "size": 2145064
 },
 "saffat": {
  "sha256": "d3bc7f6bedb3ed101e23b34432347696d7aabc0a88d88b97a24f0e6dbeb12c60",
  "size": 2245769
 },
 "ankabut": {
  "sha256": "e031b479c09936ba9c3187f88aadee1c9a3e0c6181606a99466904d19a0e1488",
  "size": 2027129
 },
 "luqman": {
  "sha256": "fb626ffd10638c42a10b7ce86540264c67f229146e1bc7bd8df265b9f0127027",
  "size": 2073790
 },
 "muzammil": {
  "sha256": "748bd923e7b314abe8505bf2c52d11e493b4def8a775239c6333095ffcc96e96",
  "size": 1977953
 },
 "qasas": {
  "sha256": "ea993f0e3f0371b0c0a3b730cd6c9fb34a326386bac3faf7cc51a397614640e0",
  "size": 1928797
 },
 "sajdah": {
  "sha256": "499c5a54da7d85efea23f2b500d8ad978d6883d0a9abd2f73436376cc709b259",
  "size": 1924592
 },
 "kahf": {
  "sha256": "b4daea8f1d4239ede85418b01837fda9d0275cc152824e2fe3fe7208f7393fa7",
  "size": 74308
 }
});
export const preparedTafseerKey=(env,copy)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'course-website-imports/tafseer/'+copy.sha256+'.json';
