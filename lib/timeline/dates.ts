export function localDateString(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
export function addLocalDays(date:string,amount:number){const[y,m,d]=date.split("-").map(Number);const value=new Date(y,m-1,d);value.setDate(value.getDate()+amount);return localDateString(value);}
export function localDayRange(date:string){const[y,m,d]=date.split("-").map(Number);const start=new Date(y,m-1,d);const end=new Date(y,m-1,d+1);return{start:start.toISOString(),end:end.toISOString(),startDate:date,endDate:date};}
export function localDateForTimestamp(value:string){return localDateString(new Date(value));}
export function formatTimelineTime(value:string){return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(value));}
