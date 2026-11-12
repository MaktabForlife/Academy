// SOURCE ONLY. Hard disabled promotion candidate; environment values cannot enable it.
export const activationAllowed=false;
export function requireReviewedProductionActivation(){
 if(activationAllowed!==true)throw Object.assign(Error('V110_PROMOTION_DISABLED'),{code:'V110_PROMOTION_DISABLED',status:503});
}
export function promotionUnavailable(){
 return Response.json({code:'SERVICE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
}
