-- Jalankan sekali di Supabase SQL Editor untuk mendukung satu foto
-- dengan maksimal sepuluh barang dan harga.
ALTER TABLE products ADD COLUMN IF NOT EXISTS judul_postingan TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS keterangan_foto TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wa_clicks BIGINT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wa_clicks_monthly BIGINT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wa_clicks_period_start DATE DEFAULT date_trunc('month', CURRENT_DATE)::date;

CREATE OR REPLACE FUNCTION increment_product_whatsapp_clicks(product_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE products
    SET wa_clicks_monthly = 0,
        wa_clicks_period_start = date_trunc('month', CURRENT_DATE)::date
    WHERE wa_clicks_period_start IS DISTINCT FROM date_trunc('month', CURRENT_DATE)::date;

    UPDATE products
    SET wa_clicks = COALESCE(wa_clicks, 0) + 1,
        wa_clicks_monthly = CASE
            WHEN wa_clicks_period_start IS DISTINCT FROM date_trunc('month', CURRENT_DATE)::date THEN 1
            ELSE COALESCE(wa_clicks_monthly, 0) + 1
        END,
        wa_clicks_period_start = date_trunc('month', CURRENT_DATE)::date
    WHERE id = product_id;
$$;

GRANT EXECUTE ON FUNCTION increment_product_whatsapp_clicks(UUID) TO anon, authenticated;
