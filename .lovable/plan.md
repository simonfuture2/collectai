

## Update SendGrid Sender Email

Update the `SENDGRID_FROM_EMAIL` secret to match a verified sender address in your SendGrid account. This will allow the campaign-outreach edge function to successfully deliver emails.

### Steps
1. Use the `add_secret` tool to prompt you to enter your verified SendGrid sender email address
2. After updating, retry a bulk campaign send from the admin dashboard to confirm delivery

### No code changes required
The edge function already reads `SENDGRID_FROM_EMAIL` from environment — only the secret value needs updating.

