# Marketing Campaigns - Testing Checklist

Use this checklist to verify all features work correctly.

## Prerequisites
- [ ] Twilio credentials added to `.env`
- [ ] Resend credentials added to `.env`
- [ ] Dev server running (`npm run dev`)
- [ ] Can access dashboard at http://localhost:3000

## Test 1: Quick SMS Message

**What**: Send an SMS to a single customer from their profile

1. [ ] Go to **Customers** page
2. [ ] Select any customer
3. [ ] Click **Marketing** tab
4. [ ] Verify channel is set to **SMS**
5. [ ] Type a test message (e.g., "This is a test SMS")
6. [ ] Verify customer has phone number on file
7. [ ] Click **"Send SMS"**
8. [ ] Verify loading spinner appears
9. [ ] Verify success toast notification appears
10. [ ] Go to **Twilio Dashboard** → Messages
11. [ ] Verify message appears with correct destination and body
12. [ ] Verify `marketing_campaigns` table has new record with `status='sent'`
13. [ ] Verify `marketing_recipients` table has new record with `status='delivered'` (or 'failed' if invalid number)

**Expected Result**: ✅ Message delivered via Twilio, tracked in DB

---

## Test 2: Quick Email Message

**What**: Send an email to a single customer from their profile

1. [ ] Same customer, Marketing tab
2. [ ] Change channel to **Email**
3. [ ] Type test message (e.g., "Hello from DexaPOS")
4. [ ] Verify customer has email on file
5. [ ] Click **"Send Email"**
6. [ ] Verify loading spinner appears
7. [ ] Verify success toast notification appears
8. [ ] Go to **Resend Dashboard** → Emails
9. [ ] Verify email appears with customer email
10. [ ] Open email in preview
11. [ ] Verify email has:
    - [ ] Merchant name in colored header
    - [ ] Your message body
    - [ ] "Manage preferences" link in footer
    - [ ] Responsive styling
12. [ ] Verify database records created

**Expected Result**: ✅ Email delivered via Resend with branded template

---

## Test 3: Create SMS Campaign

**What**: Create and send an SMS campaign to all customers

1. [ ] Go to **Campaigns** page
2. [ ] Click **"New Campaign"**
3. [ ] Fill form:
    - Name: `"Test SMS Campaign"`
    - Type: `SMS`
    - Body: `"Special offer: 20% off today!"`
    - Audience: `All Customers`
    - Scheduling: `Send Now`
4. [ ] Verify button text shows `"Create & Send"`
5. [ ] Click `"Create & Send"`
6. [ ] Verify loading spinner appears with "Sending campaign..."
7. [ ] Verify success toast: `"Campaign sent successfully!"`
8. [ ] Dialog closes automatically
9. [ ] Go back to Campaigns list
10. [ ] Verify new campaign shows `status='sent'`
11. [ ] Verify campaign shows `total_recipients > 0`
12. [ ] Click campaign to view details
13. [ ] Go to **Recipients** tab
14. [ ] Verify recipients list shows:
    - [ ] Customers who opted in (`sms_opt_in=true`)
    - [ ] Status shows `delivered` or `failed`
    - [ ] Destination shows phone number
15. [ ] Check **Twilio Dashboard**
16. [ ] Verify SMS messages sent to each recipient

**Expected Result**: ✅ Campaign sent to all SMS opt-in customers

---

## Test 4: Create Email Campaign

**What**: Create and send an email campaign

1. [ ] Go to **Campaigns** → **New Campaign**
2. [ ] Fill form:
    - Name: `"Test Email Campaign"`
    - Type: `Email`
    - Subject: `"Special Offer!"`
    - Body: `"We have an exclusive offer just for you. 20% off this weekend!"`
    - Audience: `All Customers`
    - Scheduling: `Send Now`
3. [ ] Click `"Create & Send"`
4. [ ] Verify campaign created with `status='sent'`
5. [ ] View campaign details → Recipients tab
6. [ ] Verify recipients all have `status='delivered'` or `'failed'`
7. [ ] Check **Resend Dashboard** → Emails
8. [ ] Open a sent email
9. [ ] Verify:
    - [ ] Merchant name in header
    - [ ] Your message body renders correctly
    - [ ] Footer has unsubscribe link
    - [ ] Layout is responsive
10. [ ] Verify recipients show customer emails (not null)

**Expected Result**: ✅ Email campaign sent with branded template

---

## Test 5: Schedule Campaign for Later

**What**: Create a campaign scheduled for future sending

1. [ ] Go to **Campaigns** → **New Campaign**
2. [ ] Fill form with any details
3. [ ] Change **Scheduling** to `"Schedule for Later"`
4. [ ] Set a date/time (can be in the past for testing)
5. [ ] Verify button shows `"Create Campaign"` (not "Create & Send")
6. [ ] Click create
7. [ ] Go back to Campaigns list
8. [ ] Verify new campaign shows `status='draft'` (not 'sent')
9. [ ] Click campaign to view details
10. [ ] Verify **"Send Now"** button appears
11. [ ] Click **"Send Now"**
12. [ ] Verify campaign status changes to `sent`
13. [ ] Verify recipients created and sent

**Expected Result**: ✅ Scheduled campaigns can be sent manually

---

## Test 6: Audience Filtering (Tags)

**What**: Create campaign targeting only customers with specific tags

1. [ ] Ensure at least one customer has a tag (e.g., "VIP")
2. [ ] Go to **Campaigns** → **New Campaign**
3. [ ] Fill form:
    - Name: `"VIP Exclusive"`
    - Type: `SMS`
    - Body: `"VIP exclusive offer!"`
    - Audience: `By Tags`
4. [ ] Select tag `"VIP"` from dropdown
5. [ ] Click `"Create & Send"`
6. [ ] Go to Recipients tab
7. [ ] Verify ONLY customers with "VIP" tag appear
8. [ ] Verify customers without "VIP" tag are NOT in recipients list

**Expected Result**: ✅ Tag-based filtering works correctly

---

## Test 7: Opt-in Compliance

**What**: Verify campaigns only send to opted-in customers

1. [ ] Find a customer with `sms_opt_in=false`
2. [ ] Create SMS campaign to "All Customers"
3. [ ] Go to Recipients tab
4. [ ] Verify this opted-out customer is NOT in list
5. [ ] Find a customer with `email_opt_in=false`
6. [ ] Create Email campaign to "All Customers"
7. [ ] Go to Recipients tab
8. [ ] Verify this opted-out customer is NOT in list

**Expected Result**: ✅ Only opted-in customers receive messages

---

## Test 8: Error Handling

**What**: Verify graceful error handling

### Invalid Phone Number
1. [ ] Create customer with invalid phone (e.g., "123")
2. [ ] Create SMS campaign
3. [ ] Verify customer in recipients with `status='failed'`
4. [ ] Verify `error_message` shows phone validation error

### Invalid Email
1. [ ] Create customer with invalid email (e.g., "notanemail")
2. [ ] Create Email campaign
3. [ ] Verify customer in recipients with `status='failed'`
4. [ ] Verify `error_message` shows email validation error

### Missing Credentials
1. [ ] Temporarily remove `TWILIO_ACCOUNT_SID` from env
2. [ ] Restart dev server
3. [ ] Try to send SMS
4. [ ] Verify error message shows "Twilio not configured"
5. [ ] Restore credentials

**Expected Result**: ✅ Errors handled gracefully with clear messages

---

## Test 9: Campaign Details View

**What**: Verify campaign detail sheet displays correctly

1. [ ] Go to Campaigns page
2. [ ] Click "View Details" on any sent campaign
3. [ ] Verify sheet shows:
    - [ ] Campaign name
    - [ ] Created date/time
    - [ ] Status badge (shows "Sent")
4. [ ] Click **Details** tab:
    - [ ] Type badge shows SMS/Email icon
    - [ ] Audience shows correct filter
    - [ ] Body displays correctly
5. [ ] Click **Performance** tab:
    - [ ] Shows total_recipients count
    - [ ] Shows total_delivered count
6. [ ] Click **Recipients** tab:
    - [ ] Shows list of recipients
    - [ ] Each shows: name, phone/email, status
7. [ ] For draft campaigns, verify **"Send Now"** button visible

**Expected Result**: ✅ All campaign details display correctly

---

## Test 10: Database Verification

**What**: Verify database records are created correctly

```sql
-- Check campaigns
SELECT id, name, campaign_type, status, total_recipients, total_delivered
FROM marketing_campaigns
ORDER BY created_at DESC
LIMIT 5;

-- Should show:
-- - Correct campaign type (sms/email)
-- - Status transitions (draft → sending → sent)
-- - Correct recipient counts

-- Check recipients
SELECT r.id, r.customer_id, r.destination, r.status, r.error_message
FROM marketing_recipients r
WHERE r.campaign_id = 'your-campaign-id'
ORDER BY r.created_at;

-- Should show:
-- - One row per recipient
-- - Correct destination (phone/email)
-- - Status (pending → delivered/failed)
-- - Error messages only if failed
```

**Expected Result**: ✅ All records created and updated correctly

---

## Test 11: Opt-in Management

**What**: Verify opt-in preferences work

1. [ ] Go to customer profile
2. [ ] Click Marketing tab
3. [ ] Verify opt-in checkboxes match customer data
4. [ ] Toggle SMS opt-in to ON
5. [ ] Click "Save Preferences"
6. [ ] Verify success message
7. [ ] Refresh page
8. [ ] Verify checkbox still shows ON
9. [ ] Check database: `customers.sms_opt_in` should be `true`

**Expected Result**: ✅ Opt-in preferences saved and persistent

---

## Test 12: UI Loading States

**What**: Verify UI shows proper loading states

### Quick Message
1. [ ] Click "Send SMS"
2. [ ] Immediately observe button
3. [ ] Verify button shows spinner and disables
4. [ ] Verify text changes to "Sending..."

### Create Campaign
1. [ ] Click "Create & Send"
2. [ ] Immediately observe button
3. [ ] Verify button shows spinner and disables
4. [ ] Verify dialog doesn't close until request completes

### Send Now
1. [ ] Click "Send Now" on draft campaign
2. [ ] Immediately observe button
3. [ ] Verify button shows spinner and disables
4. [ ] Verify text changes to "Sending..."

**Expected Result**: ✅ All loading states display correctly

---

## Test 13: Toast Notifications

**What**: Verify user feedback messages appear

1. [ ] Send SMS → Verify success toast
2. [ ] Send Email → Verify success toast
3. [ ] Create & Send Campaign → Verify success toast
4. [ ] Schedule Campaign → Verify success toast (says "scheduled")
5. [ ] Try to send with invalid credentials → Verify error toast
6. [ ] Try to send without phone/email → Verify error message

**Expected Result**: ✅ All notifications appear correctly

---

## Test 14: Mobile Responsiveness

**What**: Verify UI works on mobile devices

1. [ ] Open browser dev tools (F12)
2. [ ] Set viewport to iPhone 12 (390x844)
3. [ ] Go to Campaigns page
4. [ ] Verify table is readable (scroll if needed)
5. [ ] Click campaign to view details
6. [ ] Verify sheet is readable on narrow screen
7. [ ] Try quick message on Marketing tab
8. [ ] Verify all controls are accessible

**Expected Result**: ✅ UI is responsive on mobile

---

## Test 15: Performance

**What**: Verify system handles multiple campaigns

1. [ ] Create 10+ campaigns
2. [ ] Create campaign with 100+ recipients
3. [ ] Verify sending completes without timeout
4. [ ] Verify Campaigns list loads quickly
5. [ ] Verify campaign details load quickly
6. [ ] Verify database queries are efficient (check query logs)

**Expected Result**: ✅ System performs well at scale

---

## Summary

- [ ] Test 1: Quick SMS ✅
- [ ] Test 2: Quick Email ✅
- [ ] Test 3: SMS Campaign ✅
- [ ] Test 4: Email Campaign ✅
- [ ] Test 5: Schedule Campaign ✅
- [ ] Test 6: Tag Filtering ✅
- [ ] Test 7: Opt-in Compliance ✅
- [ ] Test 8: Error Handling ✅
- [ ] Test 9: Campaign Details ✅
- [ ] Test 10: Database ✅
- [ ] Test 11: Opt-in Management ✅
- [ ] Test 12: Loading States ✅
- [ ] Test 13: Toast Notifications ✅
- [ ] Test 14: Mobile Responsive ✅
- [ ] Test 15: Performance ✅

## Notes

- If any test fails, check [MARKETING_SETUP.md](MARKETING_SETUP.md) troubleshooting section
- Review server logs for detailed error information
- Check Twilio/Resend dashboards for delivery details
- Verify environment variables are set correctly

## Sign-Off

**Tested by**: _________________
**Date**: _________________
**All tests passed**: ☐ Yes ☐ No
**Issues found**: _________________
