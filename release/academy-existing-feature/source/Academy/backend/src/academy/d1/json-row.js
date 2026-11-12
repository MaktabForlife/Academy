// D1 allows 32 arguments per SQL function. json_set retains explicit nulls,
// unlike a merge-patch, and keeps wider records within that function limit.
export function jsonRowSQL(columns){
 if(columns.some(c=>!/^\w+$/.test(c)))throw Error('Invalid schema column.');
 let value=`json_object(${columns.slice(0,16).map(c=>`'${c}',"${c}"`).join(',')})`;
 for(let offset=16;offset<columns.length;offset+=15)value=`json_set(${value},${columns.slice(offset,offset+15).map(c=>`'$.${c}',"${c}"`).join(',')})`;
 return value;
}
