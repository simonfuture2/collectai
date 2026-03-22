-- Refund 2 credits to user w3mctmobile@gmail.com
UPDATE user_credits SET credits = credits + 2, updated_at = now() WHERE user_id = '8a95e2c3-a27c-4eaa-955e-6c2243b391ad';

-- Log the refund transaction
INSERT INTO credit_transactions (user_id, amount, type, description)
VALUES ('8a95e2c3-a27c-4eaa-955e-6c2243b391ad', 2, 'admin_adjustment', 'Refund: 2 scans lost due to browser close before save completed');