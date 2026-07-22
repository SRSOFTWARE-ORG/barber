import { useState, useCallback, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarbershopProvider } from "@/contexts/BarbershopContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppEventProvider } from "@/contexts/AppEventContext";
import EventOverlay from "@/components/EventOverlay";
import { CartProvider } from "@/contexts/CartContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import SplashScreen from "@/components/SplashScreen";
import RatingModal from "@/components/RatingModal";
import ScrollToTop from "@/components/ScrollToTop";
import GlobalNotifier from "@/components/GlobalNotifier";
import PushPermissionModal from "@/components/PushPermissionModal";
import UpdatePrompt from "@/components/UpdatePrompt";
import InviteGate from "@/components/InviteGate";
import ProfileCompletionGate from "@/components/ProfileCompletionGate";
import Index from "./pages/Index"; // rota inicial — eager
import AuthButton from "@/components/AuthButton";

// Code-splitting: cada rota vira um bundle separado, baixado sob demanda
const BookingPage = lazy(() => import("./pages/BookingPage"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const PromosPage = lazy(() => import("./pages/PromosPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CeoPage = lazy(() => import("./pages/CeoPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const MorePage = lazy(() => import("./pages/MorePage"));
const InstallPage = lazy(() => import("./pages/InstallPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FaturaPage = lazy(() => import("./pages/FaturaPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const MpCallbackPage = lazy(() => import("./pages/MpCallbackPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const TrustPage = lazy(() => import("./pages/TrustPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const CelebrationPreviewPage = lazy(() => import("./pages/CelebrationPreviewPage"));
const SupabaseConfigPage = lazy(() => import("./pages/SupabaseConfigPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const BarberSchedulePage = lazy(() => import("./pages/BarberSchedulePage"));
const ServicesManagePage = lazy(() => import("./pages/ServicesManagePage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const SubscriptionsManagePage = lazy(() => import("./pages/SubscriptionsManagePage"));
const BillingPortalPage = lazy(() => import("./pages/BillingPortalPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

const normalizeSupabaseResetErrorUrl = () => {
  if (typeof window === 'undefined') return;
  const { pathname, hash } = window.location;
  if (pathname !== '/' || !hash.includes('error=')) return;

  const params = new URLSearchParams(hash.slice(1));
  const errorCode = params.get('error_code') || '';
  const description = params.get('error_description') || '';
  const isExpiredResetLink = errorCode === 'otp_expired' || /email link is invalid|expired/i.test(description);

  if (!isExpiredResetLink) return;

  const next = new URL('/reset-password', window.location.origin);
  params.forEach((value, key) => next.searchParams.set(key, value));
  window.history.replaceState(null, '', `${next.pathname}${next.search}`);
};

normalizeSupabaseResetErrorUrl();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

const SPLASH_KEY = 'splash_shown_session';
const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(SPLASH_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const handleSplashFinish = useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch {}
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-center" />
        <AuthProvider>
          <LanguageProvider>
          <ThemeProvider>
            <AppEventProvider>
            <BarbershopProvider>
             <CartProvider>
              <EventOverlay />
              {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
              <RatingModal />
              <PushPermissionModal />
              <UpdatePrompt />
              <BrowserRouter>
                <ScrollToTop />
                <GlobalNotifier />
                <AuthButton />
                <div className="w-full min-h-screen relative mx-auto max-w-[100vw] lg:max-w-6xl xl:max-w-7xl overflow-x-hidden">
                  <main>
                    <Suspense fallback={<RouteFallback />}>
                      <InviteGate>
                        <ProfileCompletionGate>
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/auth" element={<AuthPage />} />
                          <Route path="/r/:code" element={<InvitePage />} />
                          <Route path="/booking" element={<BookingPage />} />
                          <Route path="/pagamento/:id" element={<PaymentPage />} />
                          <Route path="/services" element={<ServicesPage />} />
                          <Route path="/profile" element={<ProfilePage />} />
                          <Route path="/gallery" element={<GalleryPage />} />
                          <Route path="/promos" element={<PromosPage />} />
                          <Route path="/admin" element={
                            <ProtectedRoute requiredRole="admin">
                              <AdminPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/ceo" element={
                            <ProtectedRoute requiredRole="ceo">
                              <CeoPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/notifications" element={<NotificationsPage />} />
                          <Route path="/install" element={<InstallPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="/chat" element={<ChatPage />} />
                          <Route path="/more" element={<MorePage />} />
                          <Route path="/fatura" element={
                            <ProtectedRoute requiredRole="admin">
                              <FaturaPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/mp-callback" element={<MpCallbackPage />} />
                          <Route path="/marketplace" element={<MarketplacePage />} />
                          <Route path="/carrinho" element={<CartPage />} />
                          <Route path="/confianca" element={<TrustPage />} />
                          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                          <Route path="/about" element={<AboutPage />} />
                          <Route path="/celebration-preview" element={<CelebrationPreviewPage />} />
                          <Route path="/supabase-config" element={<SupabaseConfigPage />} />
                          <Route path="/reset-password" element={<ResetPasswordPage />} />
                          <Route path="/dashboard" element={
                            <ProtectedRoute>
                              <DashboardPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/subscription" element={
                            <ProtectedRoute>
                              <SubscriptionPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/clients" element={
                            <ProtectedRoute>
                              <ClientsPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/barbers" element={
                            <ProtectedRoute>
                              <BarberSchedulePage />
                            </ProtectedRoute>
                          } />
                          <Route path="/services-manage" element={
                            <ProtectedRoute>
                              <ServicesManagePage />
                            </ProtectedRoute>
                          } />
                          <Route path="/bookings" element={
                            <ProtectedRoute>
                              <BookingsPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/subscriptions-manage" element={
                            <ProtectedRoute>
                              <SubscriptionsManagePage />
                            </ProtectedRoute>
                          } />
                          <Route path="/billing" element={
                            <ProtectedRoute>
                              <BillingPortalPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/onboarding" element={
                            <ProtectedRoute>
                              <OnboardingPage />
                            </ProtectedRoute>
                          } />
                          <Route path="/analytics" element={
                            <ProtectedRoute>
                              <AnalyticsPage />
                            </ProtectedRoute>
                          } />

                          <Route path="*" element={<NotFound />} />
                        </Routes>
                        </ProfileCompletionGate>
                      </InviteGate>
                    </Suspense>
                  </main>
                  <BottomNav />
                </div>
              </BrowserRouter>
             </CartProvider>
            </BarbershopProvider>
            </AppEventProvider>
          </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
