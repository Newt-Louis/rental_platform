import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import viCommon from '@/locales/vi/common.json';
import viNav from '@/locales/vi/nav.json';
import viAuth from '@/locales/vi/auth.json';
import viDashboard from '@/locales/vi/dashboard.json';
import viSpaces from '@/locales/vi/spaces.json';
import viCrm from '@/locales/vi/crm.json';
import viBookings from '@/locales/vi/bookings.json';
import viDeals from '@/locales/vi/deals.json';
import viTenants from '@/locales/vi/tenants.json';
import viFitout from '@/locales/vi/fitout.json';
import viTickets from '@/locales/vi/tickets.json';
import viBilling from '@/locales/vi/billing.json';
import viReports from '@/locales/vi/reports.json';
import viAdmin from '@/locales/vi/admin.json';
import viProfile from '@/locales/vi/profile.json';
import viContracts from '@/locales/vi/contracts.json';
import viServiceContracts from '@/locales/vi/serviceContracts.json';
import viParking from '@/locales/vi/parking-dashboard.json';
import viWorkOrders from '@/locales/vi/workOrders.json';
import viPatrol from '@/locales/vi/patrol.json';

import enCommon from '@/locales/en/common.json';
import enNav from '@/locales/en/nav.json';
import enAuth from '@/locales/en/auth.json';
import enDashboard from '@/locales/en/dashboard.json';
import enSpaces from '@/locales/en/spaces.json';
import enCrm from '@/locales/en/crm.json';
import enBookings from '@/locales/en/bookings.json';
import enDeals from '@/locales/en/deals.json';
import enTenants from '@/locales/en/tenants.json';
import enFitout from '@/locales/en/fitout.json';
import enTickets from '@/locales/en/tickets.json';
import enBilling from '@/locales/en/billing.json';
import enReports from '@/locales/en/reports.json';
import enAdmin from '@/locales/en/admin.json';
import enProfile from '@/locales/en/profile.json';
import enContracts from '@/locales/en/contracts.json';
import enServiceContracts from '@/locales/en/serviceContracts.json';
import enParking from '@/locales/en/parking-dashboard.json';
import enWorkOrders from '@/locales/en/workOrders.json';
import enPatrol from '@/locales/en/patrol.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: {
        common: viCommon,
        nav: viNav,
        auth: viAuth,
        dashboard: viDashboard,
        spaces: viSpaces,
        crm: viCrm,
        bookings: viBookings,
        deals: viDeals,
        tenants: viTenants,
        fitout: viFitout,
        tickets: viTickets,
        billing: viBilling,
        reports: viReports,
        admin: viAdmin,
        profile: viProfile,
        contracts: viContracts,
        serviceContracts: viServiceContracts,
        parking: viParking,
        workOrders: viWorkOrders,
        patrol: viPatrol,
      },
      en: {
        common: enCommon,
        nav: enNav,
        auth: enAuth,
        dashboard: enDashboard,
        spaces: enSpaces,
        crm: enCrm,
        bookings: enBookings,
        deals: enDeals,
        tenants: enTenants,
        fitout: enFitout,
        tickets: enTickets,
        billing: enBilling,
        reports: enReports,
        admin: enAdmin,
        profile: enProfile,
        contracts: enContracts,
        serviceContracts: enServiceContracts,
        parking: enParking,
        workOrders: enWorkOrders,
        patrol: enPatrol,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'vi',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app_language',
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
