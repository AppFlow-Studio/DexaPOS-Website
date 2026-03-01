# Marketing Campaign System - Setup & Implementation Guide

## Overview
The marketing campaigns system is now fully functional with real SMS (Twilio) and Email (Resend) sending capabilities. Campaigns can be created, scheduled, and sent to customer segments with real delivery tracking.

## Environment Setup

### Required Environment Variables
Add these to your `.env` file:

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Resend Email Configuration
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Getting Credentials

#### Twilio
1. Sign up at https://www.twilio.com/
2. Go to Account Settings → API Keys & Tokens
3. Copy your `Account SID` and `Auth Token`
4. Get a Twilio phone number or use a trial number for testing
5. Set `TWILIO_PHONE_NUMBER` to the phone number (e.g., +18005551234)

#### Resend
1. Sign up at https://resend.com/
2. Navigate to API Keys section
3. Create a new API key and copy it
4. Set `RESEND_FROM_EMAIL` to an email address from your domain (or trial domain)

## Architecture

### Files Created/Modified

#### New Files:
- `lib/messaging/twilio.ts` - Twilio SMS client wrapper
- `lib/messaging/resend.ts` - Resend email client with HTML template builder

#### Modified Files:
- `app/dashboard/actions/marketing.ts` - Added `SendCampaignNow()` action, fixed imports, updated `SendQuickMessage()`
- `app/dashboard/customers/hooks/useCustomerMarketing.ts` - Added `useSendCampaign()` hook
- `app/dashboard/customers/components/campaigns/CreateCampaignDialog.tsx` - Wired up real campaign sending
- `app/dashboard/customers/components/campaigns/CampaignDetailSheet.tsx` - Added "Send Now" button
- `app/dashboard/customers/components/tabs/MarketingTab.tsx` - Fixed quick message sending

## Features

### 1. Campaign Creation & Sending
- Create campaigns in Draft status
- Choose SMS or Email channel
- Configure audience (All Customers, By Tags, or By Segment)
- Schedule for later or send immediately
- "Create & Send" button initiates real sending

### 2. Audience Resolution
Campaigns automatically filter recipients by:
- **SMS Campaigns**: Customers with `sms_opt_in=true` and valid phone numbers
- **Email Campaigns**: Customers with `email_opt_in=true` and valid email addresses
- **By Tags**: Only customers tagged with selected tags
- **By Segment**: Extensible for custom filters (currently shows "Coming soon")

### 3. Message Delivery
- SMS: Sent via Twilio with delivery tracking
- Email: Sent via Resend with branded HTML template
- Email template includes merchant name header and unsubscribe footer
- Real-time status tracking: `pending` → `delivered` or `failed`

### 4. Quick Messages
- Send one-off SMS or email from customer profile (MarketingTab)
- Validates phone/email before sending
- Tracks as a separate campaign record
- Shows in customer campaign history

### 5. Campaign Management
- View all campaigns with status, type, and recipient counts
- Filter by status and type
- Sort by name, type, status, or creation date
- View detailed campaign info, performance, and recipient list
- "Send Now" button for draft/scheduled campaigns
- Delete campaigns

## Sending Flow

### SendCampaignNow() Action Flow:
1. Fetch campaign from DB (validate draft/scheduled status)
2. Resolve audience:
   - Query customers by merchant_id + is_active=true
   - Filter by opt-in status (sms_opt_in/email_opt_in)
   - Filter by phone/email existence
   - Apply tag filters if specified
3. Create `marketing_recipients` rows (status: pending)
4. Update campaign status to "sending", set total_recipients
5. **Fire-and-forget background process**:
   - For each recipient, call Twilio/Resend
   - Update recipient status (delivered/failed)
   - Update campaign totals (total_delivered, etc.)
   - Update campaign final status to "sent"

### Validation
- Phone validation: 10+ digits only
- Email validation: Standard regex check (basic)
- Opt-in compliance: Only sends if customer opted in
- Active customer check: Soft-deleted customers (is_active=false) excluded

## Database Schema

### marketing_campaigns
- `id` - Campaign UUID
- `merchant_id` - FK to merchants
- `name` - Campaign name
- `campaign_type` - "sms" or "email"
- `subject` - Email subject (nullable)
- `body` - Message body/content
- `status` - draft, scheduled, sending, sent, cancelled
- `audience_type` - "all", "tag", or "segment"
- `audience_tags` - Array of tag filters (nullable)
- `audience_filter` - JSON for custom segment filters (nullable)
- `scheduled_for` - Future send time (nullable)
- `total_recipients` - Count of recipients added
- `total_delivered` - Count successfully delivered
- `total_opened` - Count emails opened (tracked via Resend webhooks)
- `total_clicked` - Count links clicked
- `total_bounced` - Count bounced
- `total_unsubscribed` - Count unsubscribed
- `created_at`, `updated_at`, `sent_at`
- `created_by` - FK to users/staff

### marketing_recipients
- `id` - Recipient UUID
- `campaign_id` - FK to marketing_campaigns
- `customer_id` - FK to customers
- `channel` - "sms" or "email"
- `destination` - Phone or email address
- `status` - pending, delivered, failed, bounced
- `sent_at` - When message was sent
- `delivered_at` - When confirmed delivered
- `opened_at` - When email opened (Resend webhook)
- `clicked_at` - When link clicked (Resend webhook)
- `unsubscribed_at` - When customer unsubscribed
- `error_message` - Error details if failed
- `created_at`

## Testing

### Manual Testing Checklist

1. **Setup**
   - [ ] Add TWILIO_* and RESEND_* env vars
   - [ ] Restart dev server (`npm run dev`)

2. **Quick Message (MarketingTab)**
   - [ ] Open customer profile → Marketing tab
   - [ ] Select SMS channel → Enter message → Click "Send SMS"
   - [ ] Check Twilio dashboard for sent message
   - [ ] Verify recipient status shows "delivered" or "failed"

3. **Email Quick Message**
   - [ ] Change channel to Email → Enter message → Click "Send Email"
   - [ ] Check Resend dashboard for sent email
   - [ ] Verify email has merchant name header and unsubscribe footer

4. **Campaign Creation (SMS)**
   - [ ] Go to Campaigns page → Click "New Campaign"
   - [ ] Fill: Name, Type=SMS, Body (max 160 chars)
   - [ ] Select Audience=All Customers
   - [ ] Click "Create & Send"
   - [ ] Verify campaign status = "sent" in list
   - [ ] Check Twilio dashboard shows messages for all opted-in customers
   - [ ] View campaign details → Recipients tab → Check all recipients

5. **Campaign Creation (Email)**
   - [ ] Create campaign with Type=Email
   - [ ] Enter Subject and Body
   - [ ] "Create & Send"
   - [ ] Check Resend dashboard
   - [ ] Open email → Verify header/footer styling and merchant name

6. **Audience Filtering**
   - [ ] Create campaign with Audience=By Tags
   - [ ] Select specific tags
   - [ ] "Create & Send"
   - [ ] Verify recipients list shows only tagged customers

7. **Campaign Details**
   - [ ] Click "View Details" on sent campaign
   - [ ] Check: Details tab (type, audience, body)
   - [ ] Check: Performance tab (recipient counts)
   - [ ] Check: Recipients tab (status of each recipient)

### Test Credentials
- Use Twilio trial account (free to test up to 100 messages)
- Use Resend test mode for sandbox emails
- Test with customer phone/email you control

## Troubleshooting

### SMS Not Sending
- Check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct
- Verify `TWILIO_PHONE_NUMBER` is in E.164 format (+country_code_number)
- Check customer phone is in E.164 format in DB
- Check customer has `sms_opt_in=true`
- Check Twilio account has credits/active trial

### Email Not Sending
- Check `RESEND_API_KEY` is valid (starts with `re_`)
- Verify `RESEND_FROM_EMAIL` is verified in Resend dashboard
- Check customer has `email_opt_in=true`
- Check customer email is valid format

### "No Eligible Recipients" Error
- Verify customers have opted in (sms_opt_in/email_opt_in = true)
- Verify customers have phone/email on file
- Verify customers have is_active=true
- Check audience_tags match actual customer tags

### Campaign Status Stuck on "Sending"
- If background process fails, campaign may not complete
- Check server logs for errors
- Manually update campaign status to "sent" in DB if needed:
  ```sql
  UPDATE marketing_campaigns
  SET status='sent', sent_at=NOW()
  WHERE id='campaign-id'
  ```

## Future Enhancements

1. **Segment Builder** - Custom audience filters (purchase history, spending level, etc.)
2. **Email Templates** - Designer for branded email templates
3. **Scheduling** - Background job queue (Bull, Inngest) for scheduled campaigns
4. **Analytics** - Real-time dashboard with open rates, click rates, etc.
5. **A/B Testing** - Split campaigns to test subject lines, content
6. **Webhooks** - Listen to Twilio/Resend webhooks for delivery updates
7. **Bounce Handling** - Auto-unsubscribe bounced emails
8. **Preference Center** - Customer self-serve unsubscribe management
9. **Multi-language** - Support customer preferred language in templates
10. **Rich Text Editor** - WYSIWYG editor for email/SMS content

## API Reference

### Server Actions

#### SendCampaignNow(campaignId)
Sends a campaign to all eligible recipients.
```typescript
const result = await SendCampaignNow('campaign-id');
// Returns: { message: string, sent: number } | { error: string }
```

#### SendQuickMessage(props)
Sends a one-off message to a single customer.
```typescript
const result = await SendQuickMessage({
  customerId: 'customer-id',
  merchantId: 'merchant-id',
  channel: 'sms' | 'email',
  destination: 'phone or email',
  message: 'message body',
});
```

#### CreateMarketingCampaign(props)
Creates a campaign in draft status.
```typescript
const campaign = await CreateMarketingCampaign({
  merchantId: 'merchant-id',
  name: 'Campaign Name',
  campaignType: 'sms' | 'email',
  body: 'message body',
  subject?: 'email subject',
  audienceType?: 'all' | 'tag' | 'segment',
  audienceTags?: ['TAG1', 'TAG2'],
});
```

### React Hooks

#### useSendCampaign()
Mutation hook to send a campaign.
```typescript
const mutation = useSendCampaign();
await mutation.mutateAsync(campaignId);
```

#### useMerchantMarketingCampaigns()
Query hook to fetch all campaigns for merchant.
```typescript
const { data: campaigns } = useMerchantMarketingCampaigns();
```

#### useCustomerMarketingHistory(customerId)
Query hook to fetch customer's campaign history.
```typescript
const { data: history } = useCustomerMarketingHistory(customerId);
```

## Support & Issues
For issues or questions:
1. Check troubleshooting section above
2. Review server logs for error messages
3. Check Twilio/Resend dashboards for delivery details
4. Verify environment variables are set correctly
