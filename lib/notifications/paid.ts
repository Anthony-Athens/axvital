import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { claimMilestone, sendOwnerNotification } from "./owner";
import { scheduleAnalytics } from "../telemetry/server";
export async function paidMember(request: Request, admin: SupabaseClient, invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  try {
    if (invoice.status !== "paid" || invoice.amount_paid <= 0) return;
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const invoiceCustomer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (invoiceCustomer !== customer) return;
    const { data: row, error } = await admin.from("subscriptions").select("user_id,stripe_subscription_id").eq("stripe_customer_id", customer).maybeSingle();
    if (error) throw new Error("MAPPING_FAILED");
    if (!row || row.stripe_subscription_id !== subscription.id) return;
    const price = subscription.items.data[0]?.price;
    const interval = price?.id === process.env.STRIPE_PRICE_PREMIUM_MONTHLY ? "monthly" : price?.id === process.env.STRIPE_PRICE_PREMIUM_ANNUAL ? "annual" : null;
    if (!interval) return;
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(row.user_id);
    if (accountError) throw new Error("ACCOUNT_LOOKUP_FAILED");
    if (!account.user || !await claimMilestone(admin, row.user_id, "premium_activated")) return;
    scheduleAnalytics(request, "Paid Subscription Started", interval);
    // Stripe stores amounts in minor currency units, including zero-decimal currencies.
    const format = new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency });
    const amount = format.format(invoice.amount_paid / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
    after(() => sendOwnerNotification("New AXVital Paid Member", ["A user became a paid AXVital member.", `Email: ${account.user?.email ?? invoice.customer_email ?? "Unavailable"}`, `Plan: ${interval}`, `Amount: ${amount}`, `Created: ${new Date((invoice.status_transitions.paid_at ?? invoice.created) * 1000).toISOString()}`]));
  } catch { console.error("owner_notification.paid_failed", { category: "processing_failed" }); }
}
