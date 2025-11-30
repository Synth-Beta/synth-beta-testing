# Troubleshooting 400 Error on get_connection_degree_reviews

## 🔍 **Possible Causes**

The 400 error could be:
1. **Function doesn't exist** - The fix SQL wasn't run yet
2. **Function signature mismatch** - Function exists but with wrong parameters
3. **View doesn't exist** - The view wasn't created
4. **Runtime error in function** - Function exists but fails when executing
5. **Permission issue** - Function exists but user doesn't have execute permission

## ✅ **Solution Steps**

### **Step 1: Run Diagnostic**
Run `DIAGNOSE_RPC_FUNCTION.sql` in Supabase SQL Editor to check:
- If function exists
- Function signature
- If view exists
- Permissions

### **Step 2: Apply Fix**
Run **`VERIFY_AND_FIX_RPC_FUNCTION.sql`** - This will:
- Check if view exists
- Drop and recreate the function with correct signature
- Grant proper permissions
- Verify it was created

### **Step 3: Check Browser Console**
After updating the service code, you should now see detailed error logs:
```javascript
❌ RPC function get_connection_degree_reviews failed: {
  error: {...},
  code: "...",
  message: "...",
  details: "...",
  hint: "..."
}
```

This will tell us the exact error.

## 🚀 **Quick Fix (If Function Doesn't Exist)**

If the diagnostic shows the function doesn't exist, run:

1. **First:** `FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql` (creates view and function)
2. **Or:** `VERIFY_AND_FIX_RPC_FUNCTION.sql` (just recreates function if view exists)

## 📋 **Checklist**

- [ ] View `reviews_with_connection_degree` exists
- [ ] Function `get_connection_degree_reviews` exists
- [ ] Function signature matches: `(UUID, INTEGER, INTEGER)`
- [ ] Permissions granted to `authenticated` role
- [ ] Browser console shows detailed error (after service update)

## 🔧 **If Still Failing**

After running the fix, check the browser console for the detailed error message. The updated service code will now log:
- Error code
- Error message
- Details
- Hint

Share that information and we can fix the specific issue!

