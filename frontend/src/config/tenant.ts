export const tenantConfig = {
  appName: "myboma",
  companyName: "Property OS",
  logoUrl: "/bomalog.webp",
  supportEmail: "support@myboma.com",
  appLinks: {
    // The APK is published as a GitHub Release asset (kept out of git; it was 36 MB per
    // version). Override with VITE_ANDROID_APK_URL, e.g. for a Play Store link.
    android: import.meta.env.VITE_ANDROID_APK_URL || "https://github.com/KelseySaul/myboma/releases/latest/download/myboma.apk",
    ios: "/myboma.ipa"
  }
};
