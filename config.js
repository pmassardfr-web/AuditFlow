/**
 * AuditFlow Configuration
 * Replace placeholders with your actual credentials.
 */
const AUDITFLOW_CONFIG = {
  // Supabase Configuration
  // Get these from your Supabase Project Settings > API
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseKey: 'YOUR_SUPABASE_ANON_KEY',

  // Demo Mode Configuration
  // Used as a fallback password for demo users
  demoPassword: 'Audit2025!',

  // (Optional) SharePoint / Entra Configuration
  // Used if you implement Azure AD SSO
  clientId:      "YOUR_CLIENT_ID",
  tenantId:      "YOUR_TENANT_ID",
  sharePointUrl: "https://YOUR_TENANT.sharepoint.com/sites/YOUR_SITE",
};
