-- Table to track withdrawal requests
CREATE TABLE IF NOT EXISTS withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    amount numeric(12,2) NOT NULL,
    currency varchar(10) NOT NULL DEFAULT 'USD',
    status varchar(20) NOT NULL DEFAULT 'pending', -- pending, approved, paid, failed
    method varchar(20), -- e.g. 'stripe', 'bank', 'paypal'
    payout_details jsonb, -- stores payout info (account/card/bank)
    requested_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

-- Add Stripe account ID to users table for payouts
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id varchar(255);
