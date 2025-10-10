# Connection Degree Testing Guide

## 🧪 **Testing Steps**

### **1. View Any User's Profile (Not Your Own)**
- Navigate to any other user's profile (like Tej's profile)
- You should now see a **"Connection Function Test"** section with a button

### **2. Click "Test Connection Functions"**
- This will test if the SQL functions are working
- Check the browser console for logs
- Look at the test result displayed on the page

### **3. Check Browser Console**
- Open Developer Tools (F12)
- Look for logs starting with:
  - `🔗 ConnectionDegreeBadge:` - Shows if the badge component is working
  - `🧪 Test result:` - Shows the raw function response

## 🔍 **Expected Results**

### **If Functions Are Working:**
```json
{
  "data": [
    {
      "degree": 4,
      "label": "Stranger", 
      "color": "red",
      "mutual_friends_count": 0
    }
  ],
  "error": null
}
```

### **If Functions Are NOT Working:**
```json
{
  "data": null,
  "error": {
    "message": "function get_connection_info(uuid, uuid) does not exist"
  }
}
```

## 🚨 **Troubleshooting**

### **If you see "function does not exist" error:**
1. The SQL wasn't run successfully
2. Run the SQL again in your Supabase dashboard
3. Make sure you ran both files:
   - `SIMPLIFIED_LINKEDIN_CONNECTIONS.sql`
   - `FIX_SEARCH_VISIBILITY.sql`

### **If you see no connection badge:**
1. Check the browser console for `🔗 ConnectionDegreeBadge:` logs
2. Make sure you're viewing someone else's profile (not your own)
3. The badge only shows for non-friends initially

### **If the test works but no badge appears:**
1. Check console for `✅ ConnectionDegreeBadge: Connection info:` logs
2. The badge might be there but styled differently
3. Look for any red/yellow/green colored elements near the user's name

## 🎯 **What Should Happen**

1. **Test button works** → SQL functions are installed ✅
2. **Connection badge appears** → Component is working ✅  
3. **Badge shows correct color** → Logic is working ✅
   - Red = Stranger (4th degree)
   - Dark Green = Friends (1st degree)
   - Light Green = Friends of Friends (2nd degree)
   - Yellow = Mutual Friends of Mutual Friends (3rd degree)

## 🧹 **Cleanup**

After testing, remove the test component:
1. Remove the `<ConnectionTest />` line from ProfileView.tsx
2. Remove the import: `import { ConnectionTest } from '../ConnectionTest';`
3. Delete the `ConnectionTest.tsx` file

---

**Let me know what you see when you test this!** 🚀
