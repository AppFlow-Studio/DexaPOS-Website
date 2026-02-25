# Tickets 6, 7, 8 - Setup & Next Steps

## ✅ Completed
All backend implementation and UI components have been created and integrated.

## 📋 Before Using the New Tabs

### Step 1: Execute SQL Migrations in Supabase

Execute these THREE files in **Supabase SQL Editor** in this exact order:

1. **TICKET_6_LOYALTY_SCHEMA.sql**
   - Creates loyalty program tables
   - Adds RLS policies

2. **TICKET_7_MARKETING_SCHEMA.sql**
   - Extends customers table with marketing columns
   - Creates marketing campaign tables
   - Adds RLS policies

3. **TICKET_8_DETAILS_SCHEMA.sql**
   - Extends customers table with profile fields
   - Creates customer_notes table
   - Adds RLS policies

**⚠️ Important:** Execute in this order to avoid FK constraint errors.

### Step 2: Test Locally

```bash
npm run dev
```

Then navigate to the Customers page and open a customer profile.

You should see three new tabs at the bottom:
- **Loyalty**
- **Marketing**
- **Details**

## 🎯 Testing Checklist

### Loyalty Tab
- [ ] Loyalty tab opens without errors
- [ ] Can see "Not enrolled" message if customer has no loyalty programs
- [ ] Can see programs list to enroll in
- [ ] After enrollment, shows points summary
- [ ] Can view points history
- [ ] Can add points (admin feature)
- [ ] Can view available rewards

### Marketing Tab
- [ ] Communication preferences load correctly
- [ ] Can toggle SMS/Email opt-in
- [ ] Can toggle receipt delivery options
- [ ] Can change preferred language
- [ ] Preferences save correctly
- [ ] Campaign history displays (if available)
- [ ] Can send quick message
- [ ] Unsubscribe button works

### Details Tab
- [ ] Can view customer profile
- [ ] Can edit all profile fields
- [ ] Birthday/Anniversary date pickers work
- [ ] Dietary preferences checkboxes work
- [ ] Can add tags (from dropdown or custom)
- [ ] Can remove tags
- [ ] Can add notes
- [ ] Can delete notes
- [ ] All changes save correctly

## 🔧 Troubleshooting

### "Cannot find module" errors
- Clear Next.js cache: `rm -rf .next`
- Restart dev server: `npm run dev`

### SQL Migration Errors
- Check that each migration is executed **in order**
- Verify merchant_id and staff_profiles FK references exist
- Check that RLS is enabled on each table

### Type Errors
- All TypeScript files have been updated
- If you see import errors, try:
  - Restarting IDE
  - Running `npm run type-check`

### Data Not Appearing
- Check Supabase RLS policies are correct
- Verify merchant_id is set correctly on customer profile
- Check browser console for API errors

## 📝 Implementation Details

### Files Created
```
Server Actions:
- app/dashboard/actions/loyalty.ts
- app/dashboard/actions/marketing.ts
- app/dashboard/actions/customer-details.ts

React Query Hooks:
- app/dashboard/customers/hooks/useCustomerLoyalty.ts
- app/dashboard/customers/hooks/useCustomerMarketing.ts
- app/dashboard/customers/hooks/useCustomerDetails.ts

UI Components:
- app/dashboard/customers/components/tabs/LoyaltyTab.tsx
- app/dashboard/customers/components/tabs/MarketingTab.tsx
- app/dashboard/customers/components/tabs/DetailsTab.tsx

Updated:
- app/dashboard/customers/components/CustomerProfileSheet.tsx

SQL Migrations:
- TICKET_6_LOYALTY_SCHEMA.sql
- TICKET_7_MARKETING_SCHEMA.sql
- TICKET_8_DETAILS_SCHEMA.sql
```

### Merchant ID Context
- All tabs receive `merchantId` from `profile?.customer?.merchant_id`
- This is set when the customer profile loads
- Used for all server action queries

### Authentication
- Uses Supabase RLS for data isolation
- Merchant can only see their own data
- All queries use `createServiceRoleClient()`

## 🚀 Future Enhancements

### Loyalty (Phase 2)
- [ ] Campaign builder UI
- [ ] Tier multiplier logic
- [ ] Points expiration automation
- [ ] Birthday bonus points
- [ ] Tier-based perks display

### Marketing (Phase 2)
- [ ] Campaign builder
- [ ] Bulk campaign scheduling
- [ ] SMS/Email templates
- [ ] A/B testing
- [ ] Delivery analytics

### Details (Phase 2)
- [ ] Photo upload
- [ ] Document attachments
- [ ] Activity timeline
- [ ] Merge customers UI
- [ ] Export to CSV

## 💡 Tips

1. **For Testing:** Use a test customer or create a new one in the customers list
2. **For Loyalty:** You'll need to create loyalty programs first (not done in UI yet)
3. **For Marketing:** Test with a customer that has phone and email
4. **For Details:** All fields are optional, edit at least one to test saves

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Check Supabase logs for RLS violations
3. Verify all SQL migrations executed successfully
4. Ensure merchant_id matches between customer and operations

## 🎉 You're All Set!

Once SQL migrations are executed, the new customer profile tabs are ready to use!
