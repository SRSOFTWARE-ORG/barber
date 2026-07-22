// Marketplace split helper for Mercado Pago (90/10 by default).
// The platform takes a percentage cut of every deposit as the MP marketplace fee
// (application_fee on /v1/payments, marketplace_fee on /checkout/preferences).
// The percentage is configurable via internal_secrets.platform_split_percent (e.g. "10").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_SPLIT_PERCENT = 10; // platform keeps 10%, seller keeps 90%

export async function getPlatformSplitPercent(
  admin: ReturnType<typeof createClient>,
): Promise<number> {
  try {
    const { data } = await admin
      .from("internal_secrets")
      .select("value")
      .eq("name", "platform_split_percent")
      .maybeSingle();
    const v = data?.value != null ? Number(data.value) : NaN;
    if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
  } catch (_e) {
    // fall through to default
  }
  return DEFAULT_SPLIT_PERCENT;
}

// Computes the platform fee (rounded to cents) for a given gross amount and percent.
export function computeSplit(amount: number, percent: number) {
  const platformFee = +((amount * percent) / 100).toFixed(2);
  const sellerNet = +(amount - platformFee).toFixed(2);
  return { platformFee, sellerNet };
}
