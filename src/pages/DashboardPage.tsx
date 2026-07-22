import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { OwnerDashboard, BarberDashboard, PlatformDashboard } from '@/components/dashboard/RoleDashboards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Seo from '@/components/Seo';

export default function DashboardPage() {
  const { role, barberId } = useAuth();
  const { t } = useLanguage();
  const { companyId, loading: loadingCompany } = useCompanyId();
  const features = useCompanyFeatures(companyId);

  const title = t('dashboard.title');
  const roleLabel =
    role === 'ceo' ? t('dashboard.platform')
    : role === 'admin' ? t('dashboard.admin')
    : barberId ? t('dashboard.barber')
    : t('dashboard.client');

  return (
    <div className="p-4 space-y-4 pb-24">
      <Seo title={`${title} — Barbearia`} description="Dashboard com métricas em tempo real" path="/dashboard" />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{roleLabel}</p>
        </div>
        <Badge variant={features.pwaPremium ? 'default' : 'secondary'}>
          {(features.planCode || 'free').toUpperCase()}
        </Badge>
      </header>

      {loadingCompany && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {role === 'ceo' && <PlatformDashboard />}
      {role !== 'ceo' && companyId && <OwnerDashboard companyId={companyId} />}
      {!role && barberId && <BarberDashboard barberId={barberId} />}

      {!loadingCompany && !companyId && role !== 'ceo' && !barberId && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {t('dashboard.no_data')}
        </CardContent></Card>
      )}

      {!features.pwaPremium && companyId && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <strong>{t('premium.title')}</strong>
            <p className="text-sm text-muted-foreground">{t('premium.subtitle')}</p>
            <Button asChild size="sm"><Link to="/subscription">{t('premium.upgrade_cta')}</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
