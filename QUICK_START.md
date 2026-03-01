# Marketing Campaigns - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Add Environment Variables
Create/update `.env` with:

```bash
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_PHONE_NUMBER=+1234567890

RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Get credentials:**
- **Twilio**: https://console.twilio.com/
- **Resend**: https://resend.com/api-keys

### 2. Start Dev Server
```bash
npm run dev
```

Server will warn if credentials missing (that's OK for now).

### 3. Test It Out

#### Test Quick Message (SMS)
1. Go to Customers → Select a customer
2. Click "Marketing" tab
3. Select SMS → Type message → Click "Send SMS"
4. Check Twilio dashboard → Message should appear

#### Test Campaign (Email)
1. Go to Campaigns → Click "New Campaign"
2. Name: "Test Campaign"
3. Type: Email
4. Subject: "Hello!"
5. Body: "This is a test"
6. Audience: All Customers
7. Click "Create & Send"
8. Check Resend dashboard → Message should appear

---

## 📋 Full Feature Overview

### Quick Messages (Customer Profile)
Send one-off SMS/email to single customer from their profile:
- **Marketing tab** → Select SMS or Email
- Type message → Click Send
- Tracks as campaign record
- Validates phone/email before sending

### Campaigns (Campaigns Page)
Send to multiple customers with advanced options:
- **New Campaign** button
- Choose SMS or Email
- Configure audience (All, By Tags, etc.)
- Schedule for later or send now
- View recipients and delivery status

### Campaign Details
View any campaign's full info:
- Details (message, audience, channel)
- Performance (delivery stats)
- Charts (visual stats)
- Recipients (status of each customer)
- **Send Now** button (if draft/scheduled)

---

## 🎯 Common Workflows

### Send SMS to All Customers
1. Campaigns → New Campaign
2. Name: "My Promo"
3. Type: SMS
4. Body: "Check out our sale!"
5. Audience: All Customers
6. Scheduling: Send Now
7. Click "Create & Send"

### Send Email to VIP Customers
1. Campaigns → New Campaign
2. Name: "VIP Offer"
3. Type: Email
4. Subject: "Exclusive offer for you!"
5. Body: "You're special to us..."
6. Audience: By Tags → Select "VIP"
7. Click "Create & Send"

### Schedule Campaign for Later
1. Create campaign as normal
2. Scheduling: Schedule for Later
3. Pick date/time
4. Click "Create Campaign" (note: doesn't auto-send)
5. Go back to campaign → Click "Send Now" when ready

---

## ⚠️ Troubleshooting

### "Twilio not configured" error
- Check `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in `.env`
- Restart dev server after adding env vars
- Verify phone number is in `+1234567890` format

### "Resend not configured" error
- Check `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env`
- API key should start with `re_`
- Email should be verified in Resend dashboard

### "No eligible recipients" on send
- Verify customers have opted in (`sms_opt_in` or `email_opt_in`)
- Check customers have phone/email on file
- Check customers are active (`is_active=true`)

### Email not showing merchant name
- Merchant name comes from DB
- Check merchants table has name for this merchant
- HTML template may need adjustment

---

## 📊 Checking Delivery

### Twilio Dashboard
https://console.twilio.com/ → Messages → Check sent messages

### Resend Dashboard
https://resend.com/emails → View sent emails

### Database
```sql
-- Check campaigns
SELECT id, name, status, total_recipients, total_delivered
FROM marketing_campaigns
ORDER BY created_at DESC LIMIT 5;

-- Check recipients
SELECT campaign_id, customer_id, destination, status, error_message
FROM marketing_recipients
WHERE campaign_id = 'your-campaign-id';
```

---

## 🔑 Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | Your Twilio account ID | `ACxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Your Twilio auth token | `xxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | SMS sender phone (E.164) | `+18005551234` |
| `RESEND_API_KEY` | Your Resend API key | `re_xxxxxxxx` |
| `RESEND_FROM_EMAIL` | Email sender address | `noreply@example.com` |

---

## 🎨 Customization

### Email Template
Edit `lib/messaging/resend.ts` → `buildEmailTemplate()` function:
- Change header gradient colors
- Add/remove sections
- Add merchant logo
- Change footer text

### SMS Validation
Edit `lib/messaging/twilio.ts` → `isValidPhoneNumber()`:
- Stricter phone validation
- Country-specific rules
- Custom error messages

### Audience Filters
Edit `app/dashboard/actions/marketing.ts` → `SendCampaignNow()`:
- Add custom audience filters
- Support more segment types
- Add purchase history filters

---

## 📚 Full Documentation

See these files for detailed info:
- **MARKETING_SETUP.md** - Complete setup and architecture
- **IMPLEMENTATION_SUMMARY.md** - What was built
- **.env.example.marketing** - Environment variable templates

---

## 🐛 Report Issues

If something doesn't work:
1. Check the troubleshooting section above
2. Check server logs for error messages
3. Verify environment variables are set
4. Check Twilio/Resend dashboards for details
5. Review MARKETING_SETUP.md troubleshooting section

---

## ✨ You're All Set!

Your marketing campaigns system is ready to use.

**Next steps:**
1. ✅ Add environment variables to `.env`
2. ✅ Run `npm run dev`
3. ✅ Send a test message
4. ✅ Check delivery in Twilio/Resend dashboards
5. ✅ Create campaigns with customers!
