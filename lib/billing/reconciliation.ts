export type MappingRecord={user_id:string;stripe_customer_id:string|null};
export type CustomerRecord={id:string;owner:string|null};
export type SubscriptionRecord={id:string;customer:string;status:string};
/** Only minimal operational identifiers enter this report, never raw provider objects. */
export function reconciliationFindings(mappings:MappingRecord[],customers:CustomerRecord[],subscriptions:SubscriptionRecord[]){
  const mapped=new Map(mappings.map(row=>[row.user_id,row.stripe_customer_id]));
  const owners=new Map<string,string[]>();
  for(const customer of customers)if(customer.owner)owners.set(customer.owner,[...(owners.get(customer.owner)??[]),customer.id]);
  const byCustomer=new Map(customers.map(customer=>[customer.id,customer.owner]));
  const mappedCustomers=new Set(mappings.flatMap(row=>row.stripe_customer_id?[row.stripe_customer_id]:[]));
  return {
    duplicate_metadata_owners:[...owners].filter(([,ids])=>ids.length>1).map(([user_id,customer_ids])=>({user_id,customer_ids})),
    metadata_mapping_conflicts:customers.filter(customer=>customer.owner&&mapped.get(customer.owner)!==customer.id).map(customer=>({user_id:customer.owner,customer_id:customer.id,authoritative_customer_id:mapped.get(customer.owner!)??null})),
    non_authoritative_subscriptions:subscriptions.filter(subscription=>{
      const owner=byCustomer.get(subscription.customer);
      return owner?mapped.get(owner)!==subscription.customer:!mappedCustomers.has(subscription.customer);
    }),
    customers_without_owner_metadata:customers.filter(customer=>!customer.owner).map(customer=>customer.id),
  };
}
