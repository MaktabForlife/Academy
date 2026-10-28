// Private, immutable import packages. Reading one never publishes a website.
export const preparedTafseerCopies=Object.freeze({
 "foundations": {
  "sha256": "fb3a64153301e2d0d85f68703cc0c2841901da5e6e87ad59a3fd2f9df8f3ed79",
  "size": 11307625
 },
 "yaseen": {
  "sha256": "bc997ac4d1292400fa409e86f4cee9034d0a778bf0ff6148c166fc242f992761",
  "size": 12053434
 },
 "saffat": {
  "sha256": "f45625db9f0170f58435cda9febf01fb10b23564e3f2bef9074370cd31fac04b",
  "size": 14202747
 },
 "ankabut": {
  "sha256": "b4a637b4cb7ec97a8c13b6ca42f74a5ccd748d75f7826fe997364a3c2e21ac66",
  "size": 5861380
 },
 "luqman": {
  "sha256": "d5547241c5b579b8ec451974698350309fa83a78e33825a7d71f64627b6da999",
  "size": 4402755
 },
 "muzammil": {
  "sha256": "7ea942c2ec856acb7997ca5124fd3c6d70595f3d43d936c9772276d3b3960067",
  "size": 6002695
 },
 "qasas": {
  "sha256": "9134d636dff2d5e6415e92690fd28d599c42a167b53b225541a1b26baf420839",
  "size": 3436989
 },
 "sajdah": {
  "sha256": "4dcdf9a5ef2f933a1c78367575e4af7a17ec2e9d3a5fd50b26d925ea36df97e0",
  "size": 5389500
 }
});
export const preparedTafseerKey=(env,copy)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'course-website-imports/tafseer/'+copy.sha256+'.json';
