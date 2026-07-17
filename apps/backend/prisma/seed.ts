import { PrismaClient, Role, UnitStatus, LeadSource, LeadStatus, LeadPriority, ProposalStatus, ContractStatus, ContractType, BillingCycle, TicketType, TicketPriority, TicketStatus, InvoiceType, InvoiceStatus, PaymentMethod, CustomerStatus, BookingStatus, BookingActivityType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { buildApprovalStepsFromRules } from './approval-policy-seed.util';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Clean up existing data (Wave 6-7 tables first)
  await prisma.emailDelivery.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.unifiedDocument.deleteMany();
  await prisma.bookingActivity.deleteMany();
  await prisma.unitBooking.deleteMany();
  await prisma.customerActivity.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.categoryMallPricing.deleteMany();
  await prisma.workerAccessLog.deleteMany();
  await prisma.fitoutContractor.deleteMany();
  await prisma.salesAuditTrail.deleteMany();
  await prisma.proposalScenario.deleteMany();
  await prisma.sapEntityMapping.deleteMany();
  await prisma.userMallAccess.deleteMany();
  await prisma.mallAnnouncement.deleteMany();
  await prisma.ticketRating.deleteMany();
  await prisma.maintenanceSchedule.deleteMany();
  await prisma.leadFollowUp.deleteMany();
  await prisma.contractTermination.deleteMany();
  // Clean up existing data (Wave 4-5 tables first)
  await prisma.complianceExport.deleteMany();
  await prisma.mallPolicy.deleteMany();
  await prisma.renewalRiskScore.deleteMany();
  await prisma.occupancySnapshot.deleteMany();
  await prisma.ticketEscalation.deleteMany();
  await prisma.ticketSlaPolicy.deleteMany();
  await prisma.fitoutMilestone.deleteMany();
  await prisma.fitoutSlaPolicy.deleteMany();
  await prisma.fitoutDocument.deleteMany();
  await prisma.fitoutDocumentGate.deleteMany();
  await prisma.sapReconciliationRecord.deleteMany();
  await prisma.contractEvent.deleteMany();
  await prisma.contractAmendment.deleteMany();
  await prisma.contractClause.deleteMany();
  await prisma.contractTemplate.deleteMany();
  await prisma.proposalDealScore.deleteMany();
  await prisma.dealScoreCriterion.deleteMany();
  await prisma.penaltyInterestPolicy.deleteMany();
  await prisma.billingConfig.deleteMany();
  await prisma.arDunningLog.deleteMany();
  await prisma.arDunningPolicy.deleteMany();
  await prisma.billingScheduleEntry.deleteMany();
  await prisma.proposalVersion.deleteMany();
  await prisma.floorPlanAnalysis.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.salesTurnover.deleteMany();
  await prisma.fitoutChecklist.deleteMany();
  await prisma.fitoutProject.deleteMany();
  await prisma.contractFile.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalWorkflow.deleteMany();
  await prisma.approvalPolicyRule.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.category.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.building.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.mall.deleteMany();
  await prisma.sapIntegrationLog.deleteMany();

  // Create Users
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  const userPasswordHash = await bcrypt.hash('User123!', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@thiso.com',
      password: passwordHash,
      fullName: 'System Administrator',
      role: Role.ADMIN,
      phone: '0901234567',
      department: 'IT',
      isActive: true,
    },
  });

  const leasingExec = await prisma.user.create({
    data: {
      email: 'executive@thiso.com',
      password: userPasswordHash,
      fullName: 'Nguyen Van A',
      role: Role.LEASING_EXECUTIVE,
      phone: '0901234568',
      department: 'Leasing',
      isActive: true,
    },
  });

  const leasingManager = await prisma.user.create({
    data: {
      email: 'manager@thiso.com',
      password: userPasswordHash,
      fullName: 'Tran Thi B',
      role: Role.LEASING_MANAGER,
      phone: '0901234569',
      department: 'Leasing',
      isActive: true,
    },
  });

  const mallDirector = await prisma.user.create({
    data: {
      email: 'director@thiso.com',
      password: userPasswordHash,
      fullName: 'Le Van C',
      role: Role.MALL_DIRECTOR,
      phone: '0901234570',
      department: 'Management',
      isActive: true,
    },
  });

  const financeUser = await prisma.user.create({
    data: {
      email: 'finance@thiso.com',
      password: userPasswordHash,
      fullName: 'Pham Thi D',
      role: Role.FINANCE,
      phone: '0901234571',
      department: 'Finance',
      isActive: true,
    },
  });

  const legalUser = await prisma.user.create({
    data: {
      email: 'legal@thiso.com',
      password: userPasswordHash,
      fullName: 'Hoang Van E',
      role: Role.LEGAL,
      phone: '0901234572',
      department: 'Legal',
      isActive: true,
    },
  });

  const operationUser = await prisma.user.create({
    data: {
      email: 'operation@thiso.com',
      password: userPasswordHash,
      fullName: 'Vu Thi F',
      role: Role.OPERATION,
      phone: '0901234573',
      department: 'Operations',
      isActive: true,
    },
  });

  const ceoUser = await prisma.user.create({
    data: {
      email: 'ceo@thiso.com',
      password: userPasswordHash,
      fullName: 'Nguyen Minh G',
      role: Role.CEO,
      phone: '0901234574',
      department: 'Executive',
      isActive: true,
    },
  });

  const tenantPortalUser = await prisma.user.create({
    data: {
      email: 'tenant@thiso.com',
      password: userPasswordHash,
      fullName: 'Tenant Portal User',
      role: Role.TENANT,
      phone: '0901234575',
      department: 'Tenant',
      isActive: true,
    },
  });

  console.log('Users created');

  // Create approval policy rules (config-driven, no hardcoded workflow in runtime)
  await prisma.approvalPolicyRule.createMany({
    data: [
      {
        code: 'BASE_LEASING_MANAGER',
        name: 'Base Leasing Manager Approval',
        stepName: 'Leasing Manager Approval',
        stepOrder: 10,
        approverRole: Role.LEASING_MANAGER,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
        isActive: true,
      },
      {
        code: 'MALL_DIRECTOR_HIGH_DISCOUNT',
        name: 'Mall Director on discount > 5%',
        stepName: 'Mall Director Approval',
        stepOrder: 20,
        approverRole: Role.MALL_DIRECTOR,
        conditionType: 'DISCOUNT_PCT',
        operator: '>',
        threshold: 5,
        isRequired: false,
        isActive: true,
      },
      {
        code: 'CEO_VERY_HIGH_DISCOUNT',
        name: 'CEO on discount > 10%',
        stepName: 'CEO Approval',
        stepOrder: 30,
        approverRole: Role.CEO,
        conditionType: 'DISCOUNT_PCT',
        operator: '>',
        threshold: 10,
        isRequired: false,
        isActive: true,
      },
      {
        code: 'MALL_DIRECTOR_LONG_RENT_FREE',
        name: 'Mall Director on rent free > 60 days',
        stepName: 'Mall Director Approval',
        stepOrder: 40,
        approverRole: Role.MALL_DIRECTOR,
        conditionType: 'RENT_FREE_DAYS',
        operator: '>',
        threshold: 60,
        isRequired: false,
        isActive: true,
      },
      {
        code: 'FINANCE_REQUIRED',
        name: 'Finance Review Mandatory',
        stepName: 'Finance Review',
        stepOrder: 50,
        approverRole: Role.FINANCE,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
        isActive: true,
      },
      {
        code: 'LEGAL_REQUIRED',
        name: 'Legal Review Mandatory',
        stepName: 'Legal Review',
        stepOrder: 60,
        approverRole: Role.LEGAL,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
        isActive: true,
      },
      {
        code: 'FINANCE_AR_DEBT',
        name: 'Finance Review if tenant has overdue AR',
        stepName: 'Finance Risk Review',
        stepOrder: 55,
        approverRole: Role.FINANCE,
        conditionType: 'HAS_AR_DEBT',
        isRequired: false,
        isActive: true,
      },
      // Price Deviation Rules
      {
        code: 'PRICE_BELOW_MIN_5',
        name: 'Giá thấp hơn sàn 0-5%',
        stepName: 'Leasing Manager Price Review',
        stepOrder: 15,
        approverRole: Role.LEASING_MANAGER,
        conditionType: 'PRICE_DEVIATION_PCT',
        operator: 'BETWEEN',
        threshold: 0,
        matchValue: '5',
        isRequired: false,
        isActive: true,
      },
      {
        code: 'PRICE_BELOW_MIN_10',
        name: 'Giá thấp hơn sàn 5-10%',
        stepName: 'Mall Director Price Review',
        stepOrder: 25,
        approverRole: Role.MALL_DIRECTOR,
        conditionType: 'PRICE_DEVIATION_PCT',
        operator: 'BETWEEN',
        threshold: 5,
        matchValue: '10',
        isRequired: false,
        isActive: true,
      },
      {
        code: 'PRICE_BELOW_MIN_OVER_10',
        name: 'Giá thấp hơn sàn >10%',
        stepName: 'CEO Price Review',
        stepOrder: 35,
        approverRole: Role.CEO,
        conditionType: 'PRICE_DEVIATION_PCT',
        operator: '>',
        threshold: 10,
        isRequired: false,
        isActive: true,
      },
    ],
  });

  await prisma.dealScoreCriterion.createMany({
    data: [
      { code: 'CUSTOMER_RATING', name: 'Customer rating', fieldSource: 'CUSTOMER_RATING', weight: 1.5, minScore: 0, maxScore: 100, isActive: true },
      { code: 'BRAND_STRENGTH', name: 'Brand strength', fieldSource: 'BRAND_STRENGTH', weight: 1.2, minScore: 0, maxScore: 100, isActive: true },
      { code: 'FINANCIAL_CAPACITY', name: 'Financial capacity', fieldSource: 'FINANCIAL_CAPACITY', weight: 1.3, minScore: 0, maxScore: 100, isActive: true },
      { code: 'INDUSTRY_FIT', name: 'Industry fit', fieldSource: 'INDUSTRY_FIT', weight: 1, minScore: 0, maxScore: 100, isActive: true },
      { code: 'DISCOUNT_RISK', name: 'Discount & rent-free risk', fieldSource: 'DISCOUNT_RISK', weight: 1.5, minScore: 0, maxScore: 100, isActive: true },
    ],
  });

  await prisma.penaltyInterestPolicy.create({
    data: {
      code: 'DEFAULT_PENALTY',
      name: 'Default late payment penalty',
      annualRate: 12,
      graceDays: 7,
      isActive: true,
    },
  });

  await prisma.billingConfig.create({
    data: { autoIssueInvoices: false, notifyTenantOnIssue: true },
  });

  const leaseTemplate = await prisma.contractTemplate.create({
    data: {
      code: 'LEASE_STANDARD',
      name: 'Standard Lease Agreement',
      contractType: ContractType.LEASE_AGREEMENT,
      content: 'Hợp đồng thuê mặt bằng số {{contractNumber}} giữa THISO Mall và {{tenantName}} ({{companyName}}) cho lô {{unitCode}}. Tiền thuê: {{rent}} VNĐ/tháng. CAM: {{cam}} VNĐ/tháng. Thời hạn: {{startDate}} — {{endDate}} ({{term}} tháng).',
      clauses: {
        create: [
          { code: 'RENT', title: 'Điều khoản tiền thuê', content: 'Bên thuê thanh toán tiền thuê {{rent}} VNĐ/tháng.', order: 1, isRequired: true },
          { code: 'CAM', title: 'Phí dịch vụ chung', content: 'Phí CAM {{cam}} VNĐ/tháng.', order: 2, isRequired: true },
          { code: 'TERM', title: 'Thời hạn hợp đồng', content: 'Hợp đồng có hiệu lực từ {{startDate}} đến {{endDate}}.', order: 3, isRequired: true },
        ],
      },
    },
  });

  await prisma.arDunningPolicy.createMany({
    data: [
      {
        code: 'DUNNING_L1',
        name: 'Reminder Level 1',
        level: 1,
        minDaysOverdue: 1,
        maxDaysOverdue: 7,
        notifyTenant: true,
        notifyFinance: true,
        isActive: true,
      },
      {
        code: 'DUNNING_L2',
        name: 'Reminder Level 2',
        level: 2,
        minDaysOverdue: 8,
        maxDaysOverdue: 30,
        notifyTenant: true,
        notifyFinance: true,
        isActive: true,
      },
      {
        code: 'DUNNING_L3',
        name: 'Escalation Level 3',
        level: 3,
        minDaysOverdue: 31,
        maxDaysOverdue: null,
        notifyTenant: true,
        notifyFinance: true,
        isActive: true,
      },
    ],
  });

  // Create Mall
  const mall = await prisma.mall.create({
    data: {
      name: 'THISO Mall Sala',
      code: 'THISO-SALA',
      address: '10 Mai Chi Tho, An Phu Ward, Thu Duc City',
      city: 'Ho Chi Minh City',
      totalArea: 45000,
      description: 'A premium shopping mall in the heart of Sala urban area',
      isActive: true,
    },
  });

  // Create Building
  const building = await prisma.building.create({
    data: {
      mallId: mall.id,
      name: 'Main Building',
      code: 'MB',
      isActive: true,
    },
  });

  // Create Floors
  const floorData = [
    { name: 'Ground Floor', level: 'GF', sortOrder: 0 },
    { name: 'Level 1', level: 'L1', sortOrder: 1 },
    { name: 'Level 2', level: 'L2', sortOrder: 2 },
    { name: 'Level 3', level: 'L3', sortOrder: 3 },
    { name: 'Level 4', level: 'L4', sortOrder: 4 },
  ];

  const floors = await Promise.all(
    floorData.map((f) =>
      prisma.floor.create({
        data: {
          mallId: mall.id,
          buildingId: building.id,
          name: f.name,
          level: f.level,
          sortOrder: f.sortOrder,
          isActive: true,
        },
      })
    )
  );

  // Create Zones (5 per floor)
  const zoneNames = ['A', 'B', 'C', 'D', 'E'];
  const allZones = [];
  for (const floor of floors) {
    for (const zoneName of zoneNames) {
      const zone = await prisma.zone.create({
        data: {
          mallId: mall.id,
          buildingId: building.id,
          floorId: floor.id,
          name: `Zone ${zoneName}`,
          code: `${floor.level}-${zoneName}`,
          isActive: true,
        },
      });
      allZones.push({ zone, floor });
    }
  }

  console.log('Mall structure created');

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY MASTER DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const categoriesData = [
    { code: 'FNB', name: 'F&B', description: 'Food & Beverage', sortOrder: 1 },
    { code: 'FASHION', name: 'Fashion', description: 'Fashion & Apparel', sortOrder: 2 },
    { code: 'BEAUTY', name: 'Beauty & Wellness', description: 'Health, Beauty & Wellness', sortOrder: 3 },
    { code: 'TECH', name: 'Technology', description: 'Electronics & Technology', sortOrder: 4 },
    { code: 'ENTERTAINMENT', name: 'Entertainment', description: 'Entertainment & Leisure', sortOrder: 5 },
    { code: 'CONVENIENCE', name: 'Convenience Store', description: 'Convenience & Mini Mart', sortOrder: 6 },
    { code: 'SUPERMARKET', name: 'Supermarket', description: 'Supermarket & Grocery', sortOrder: 7 },
    { code: 'SERVICES', name: 'Services', description: 'Services & Others', sortOrder: 8 },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    const created = await prisma.category.create({
      data: { ...cat, isActive: true },
    });
    categories[cat.code] = created;
  }

  // Sub-categories for F&B
  await prisma.category.createMany({
    data: [
      { code: 'FNB_COFFEE', name: 'Coffee & Tea', parentId: categories['FNB'].id, sortOrder: 1, isActive: true },
      { code: 'FNB_RESTAURANT', name: 'Restaurant', parentId: categories['FNB'].id, sortOrder: 2, isActive: true },
      { code: 'FNB_FASTFOOD', name: 'Fast Food', parentId: categories['FNB'].id, sortOrder: 3, isActive: true },
      { code: 'FNB_BAKERY', name: 'Bakery & Dessert', parentId: categories['FNB'].id, sortOrder: 4, isActive: true },
    ],
  });

  // Sub-categories for Fashion
  await prisma.category.createMany({
    data: [
      { code: 'FASHION_APPAREL', name: 'Apparel', parentId: categories['FASHION'].id, sortOrder: 1, isActive: true },
      { code: 'FASHION_SHOES', name: 'Shoes & Footwear', parentId: categories['FASHION'].id, sortOrder: 2, isActive: true },
      { code: 'FASHION_ACCESSORIES', name: 'Accessories', parentId: categories['FASHION'].id, sortOrder: 3, isActive: true },
    ],
  });

  console.log('Categories created');

  // Category Pricing per Mall (mall-wide pricing)
  const categoryPricingData = [
    { categoryCode: 'FNB', minRent: 900000, maxRent: 1500000, suggested: 1100000, cam: 130000 },
    { categoryCode: 'FASHION', minRent: 650000, maxRent: 1100000, suggested: 850000, cam: 100000 },
    { categoryCode: 'BEAUTY', minRent: 700000, maxRent: 1200000, suggested: 900000, cam: 110000 },
    { categoryCode: 'TECH', minRent: 600000, maxRent: 1000000, suggested: 750000, cam: 95000 },
    { categoryCode: 'ENTERTAINMENT', minRent: 400000, maxRent: 700000, suggested: 500000, cam: 70000 },
    { categoryCode: 'CONVENIENCE', minRent: 800000, maxRent: 1200000, suggested: 950000, cam: 120000 },
    { categoryCode: 'SUPERMARKET', minRent: 300000, maxRent: 500000, suggested: 380000, cam: 60000 },
    { categoryCode: 'SERVICES', minRent: 500000, maxRent: 900000, suggested: 650000, cam: 85000 },
  ];

  for (const pricing of categoryPricingData) {
    await prisma.categoryMallPricing.create({
      data: {
        mallId: mall.id,
        categoryId: categories[pricing.categoryCode].id,
        minRentPerSqm: pricing.minRent,
        maxRentPerSqm: pricing.maxRent,
        suggestedRent: pricing.suggested,
        camPerSqm: pricing.cam,
        effectiveFrom: new Date('2026-01-01'),
        isActive: true,
        notes: `Standard pricing for ${pricing.categoryCode} category`,
      },
    });
  }

  // Floor-specific pricing for premium floors (GF has higher rent)
  const gfFloor = floors.find(f => f.level === 'GF');
  if (gfFloor) {
    for (const pricing of categoryPricingData.slice(0, 4)) {
      await prisma.categoryMallPricing.create({
        data: {
          mallId: mall.id,
          categoryId: categories[pricing.categoryCode].id,
          floorId: gfFloor.id,
          minRentPerSqm: pricing.minRent * 1.2, // 20% premium for GF
          maxRentPerSqm: pricing.maxRent * 1.3,
          suggestedRent: pricing.suggested * 1.25,
          camPerSqm: pricing.cam * 1.1,
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
          notes: `Premium Ground Floor pricing for ${pricing.categoryCode}`,
        },
      });
    }
  }

  console.log('Category pricing created');

  // Create Tenants
  const tenantsData = [
    {
      companyName: 'Highlands Coffee Vietnam Co., Ltd',
      brandName: 'Highlands Coffee',
      taxCode: '0123456789',
      contactName: 'Nguyen Van Hung',
      contactEmail: 'hung@highlands.com.vn',
      contactPhone: '0281234567',
      category: 'F&B',
      portalEmail: 'portal.highlands@thiso.com',
    },
    {
      companyName: 'Jollibee Vietnam Co., Ltd',
      brandName: 'Jollibee',
      taxCode: '0123456790',
      contactName: 'Maria Santos',
      contactEmail: 'maria@jollibee.com.vn',
      contactPhone: '0281234568',
      category: 'F&B',
      portalEmail: 'portal.jollibee@thiso.com',
    },
    {
      companyName: 'Fast Retailing Vietnam Co., Ltd',
      brandName: 'Uniqlo',
      taxCode: '0123456791',
      contactName: 'Tanaka Hiroshi',
      contactEmail: 'tanaka@uniqlo.com.vn',
      contactPhone: '0281234569',
      category: 'Fashion',
      portalEmail: 'portal.uniqlo@thiso.com',
    },
    {
      companyName: 'Guardian Vietnam Co., Ltd',
      brandName: 'Guardian',
      taxCode: '0123456792',
      contactName: 'Le Thi Mai',
      contactEmail: 'mai@guardian.com.vn',
      contactPhone: '0281234570',
      category: 'Health & Beauty',
      portalEmail: 'portal.guardian@thiso.com',
    },
    {
      companyName: 'Circle K Vietnam Co., Ltd',
      brandName: 'Circle K',
      taxCode: '0123456793',
      contactName: 'Tran Van Duc',
      contactEmail: 'duc@circlek.com.vn',
      contactPhone: '0281234571',
      category: 'Convenience Store',
      portalEmail: 'portal.circlek@thiso.com',
    },
    {
      companyName: "McDonald's Vietnam Co., Ltd",
      brandName: "McDonald's",
      taxCode: '0123456794',
      contactName: 'James Wilson',
      contactEmail: 'james@mcdonalds.com.vn',
      contactPhone: '0281234572',
      category: 'F&B',
      portalEmail: 'portal.mcdonalds@thiso.com',
    },
    {
      companyName: 'The Coffee House Vietnam Co., Ltd',
      brandName: 'The Coffee House',
      taxCode: '0123456795',
      contactName: 'Pham Minh Trung',
      contactEmail: 'trung@thecoffeehouse.com',
      contactPhone: '0281234573',
      category: 'F&B',
      portalEmail: 'portal.coffeehouse@thiso.com',
    },
    {
      companyName: 'Shopee Vietnam Co., Ltd',
      brandName: 'Shopee',
      taxCode: '0123456796',
      contactName: 'Chen Wei',
      contactEmail: 'wei@shopee.vn',
      contactPhone: '0281234574',
      category: 'Technology',
      portalEmail: 'portal.shopee@thiso.com',
    },
    {
      companyName: 'FPT Retail Co., Ltd',
      brandName: 'FPT Retail',
      taxCode: '0123456797',
      contactName: 'Nguyen Duc Tai',
      contactEmail: 'tai@fptretail.com',
      contactPhone: '0281234575',
      category: 'Technology',
      portalEmail: 'portal.fptretail@thiso.com',
    },
    {
      companyName: 'Lotteria Vietnam Co., Ltd',
      brandName: 'Lotteria',
      taxCode: '0123456798',
      contactName: 'Kim Sung Jin',
      contactEmail: 'sung@lotteria.vn',
      contactPhone: '0281234576',
      category: 'F&B',
      portalEmail: 'portal.lotteria@thiso.com',
    },
  ];

  const tenantPortalPassword = await bcrypt.hash('Tenant123!', 10);
  const tenants = await Promise.all(
    tenantsData.map(({ portalEmail: _portalEmail, ...tenant }) =>
      prisma.tenant.create({ data: { ...tenant, isPortalUser: true, isActive: true } })
    ),
  );

  await Promise.all(tenants.map((tenant, index) =>
    prisma.user.create({
      data: {
        email: tenantsData[index].portalEmail,
        password: tenantPortalPassword,
        fullName: tenantsData[index].contactName,
        role: Role.TENANT,
        tenantId: tenant.id,
        isActive: true,
      },
    }),
  ));

  console.log('Tenants created');

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS (CRM - prospective tenants, not yet contracted)
  // ═══════════════════════════════════════════════════════════════════════════
  const customersData = [
    { customerCode: 'CUST-001', companyName: 'KFC Vietnam Co., Ltd', brandName: 'KFC', contactName: 'Robert Brown', email: 'robert@kfc.com.vn', phone: '0291234567', source: LeadSource.BROKER, status: CustomerStatus.NEGOTIATING, industry: 'F&B', preferredCategory: 'F&B', expectedArea: 200, budgetMin: 800000, budgetMax: 1000000 },
    { customerCode: 'CUST-002', companyName: 'Inditex Vietnam Co., Ltd', brandName: 'Zara', contactName: 'Carlos Rodriguez', email: 'carlos@zara.com.vn', phone: '0291234568', source: LeadSource.WEBSITE, status: CustomerStatus.NEGOTIATING, industry: 'Fashion', preferredCategory: 'Fashion', expectedArea: 300, budgetMin: 700000, budgetMax: 900000 },
    { customerCode: 'CUST-003', companyName: 'Starbucks Vietnam Co., Ltd', brandName: 'Starbucks', contactName: 'Sarah Johnson', email: 'sarah@starbucks.com.vn', phone: '0291234569', source: LeadSource.REFERRAL, status: CustomerStatus.NEGOTIATING, industry: 'F&B', preferredCategory: 'F&B', expectedArea: 150, budgetMin: 1000000, budgetMax: 1300000 },
    { customerCode: 'CUST-004', companyName: 'H&M Vietnam Co., Ltd', brandName: 'H&M', contactName: 'Erik Svensson', email: 'erik@hm.com.vn', phone: '0291234570', source: LeadSource.WEBSITE, status: CustomerStatus.PROSPECT, industry: 'Fashion', preferredCategory: 'Fashion', expectedArea: 400, budgetMin: 650000, budgetMax: 850000 },
    { customerCode: 'CUST-005', companyName: 'Pizza Hut Vietnam Co., Ltd', brandName: 'Pizza Hut', contactName: 'David Lee', email: 'david@pizzahut.com.vn', phone: '0291234571', source: LeadSource.WALK_IN, status: CustomerStatus.PROSPECT, industry: 'F&B', preferredCategory: 'F&B', expectedArea: 180, budgetMin: 750000, budgetMax: 950000 },
    { customerCode: 'CUST-006', companyName: 'AS Watson Vietnam Co., Ltd', brandName: 'Watsons', contactName: 'Michelle Tan', email: 'michelle@watsons.com.vn', phone: '0291234572', source: LeadSource.BROKER, status: CustomerStatus.NEGOTIATING, industry: 'Health & Beauty', preferredCategory: 'Health & Beauty', expectedArea: 200, budgetMin: 800000, budgetMax: 1000000 },
    { customerCode: 'CUST-007', companyName: 'CJ CGV Vietnam Co., Ltd', brandName: 'CGV Cinemas', contactName: 'Kim Dong Hyun', email: 'donghyun@cgv.vn', phone: '0291234583', source: LeadSource.BROKER, status: CustomerStatus.NEGOTIATING, industry: 'Entertainment', preferredCategory: 'Entertainment', expectedArea: 2000, budgetMin: 350000, budgetMax: 500000 },
    { customerCode: 'CUST-008', companyName: 'CellphoneS JSC', brandName: 'CellphoneS', contactName: 'Tran Minh Quan', email: 'quan@cellphones.com.vn', phone: '0291234575', source: LeadSource.REFERRAL, status: CustomerStatus.PROSPECT, industry: 'Technology', preferredCategory: 'Technology', expectedArea: 120, budgetMin: 700000, budgetMax: 850000 },
    { customerCode: 'CUST-009', companyName: 'Phuc Long Heritage Co., Ltd', brandName: 'Phuc Long Coffee', contactName: 'Le Quoc Hung', email: 'hung@phuclong.com.vn', phone: '0291234576', source: LeadSource.BROKER, status: CustomerStatus.NEGOTIATING, industry: 'F&B', preferredCategory: 'F&B', expectedArea: 160, budgetMin: 900000, budgetMax: 1100000 },
    { customerCode: 'CUST-010', companyName: 'LVMH Beauty Vietnam Co., Ltd', brandName: 'Sephora', contactName: 'Isabelle Martin', email: 'isabelle@sephora.com.vn', phone: '0291234582', source: LeadSource.BROKER, status: CustomerStatus.NEGOTIATING, industry: 'Health & Beauty', preferredCategory: 'Health & Beauty', expectedArea: 250, budgetMin: 900000, budgetMax: 1100000 },
  ];

  const customers = await Promise.all(
    customersData.map((c) =>
      prisma.customer.create({
        data: { ...c, isActive: true, createdById: leasingExec.id },
      })
    )
  );

  console.log('Customers created');

  // Create Units (30 units across floors)
  const unitConfigs = [
    // GF units
    { floorIdx: 0, zone: 'A', code: 'GF-A01', areaGFA: 120, areaNLA: 100, category: 'F&B', baseRent: 1200000, cam: 150000 },
    { floorIdx: 0, zone: 'A', code: 'GF-A02', areaGFA: 150, areaNLA: 130, category: 'F&B', baseRent: 1200000, cam: 150000 },
    { floorIdx: 0, zone: 'B', code: 'GF-B01', areaGFA: 80, areaNLA: 70, category: 'Convenience Store', baseRent: 1000000, cam: 120000 },
    { floorIdx: 0, zone: 'B', code: 'GF-B02', areaGFA: 200, areaNLA: 180, category: 'Fashion', baseRent: 900000, cam: 110000 },
    { floorIdx: 0, zone: 'C', code: 'GF-C01', areaGFA: 300, areaNLA: 270, category: 'Fashion', baseRent: 850000, cam: 100000 },
    { floorIdx: 0, zone: 'C', code: 'GF-C02', areaGFA: 250, areaNLA: 225, category: 'Health & Beauty', baseRent: 900000, cam: 110000 },
    // L1 units
    { floorIdx: 1, zone: 'A', code: 'L1-A01', areaGFA: 180, areaNLA: 160, category: 'F&B', baseRent: 1000000, cam: 130000 },
    { floorIdx: 1, zone: 'A', code: 'L1-A02', areaGFA: 220, areaNLA: 200, category: 'F&B', baseRent: 1000000, cam: 130000 },
    { floorIdx: 1, zone: 'B', code: 'L1-B01', areaGFA: 150, areaNLA: 135, category: 'Fashion', baseRent: 800000, cam: 100000 },
    { floorIdx: 1, zone: 'B', code: 'L1-B02', areaGFA: 180, areaNLA: 162, category: 'Fashion', baseRent: 800000, cam: 100000 },
    { floorIdx: 1, zone: 'B', code: 'L1-B03', areaGFA: 350, areaNLA: 315, category: 'Fashion', baseRent: 750000, cam: 95000 },
    { floorIdx: 1, zone: 'C', code: 'L1-C01', areaGFA: 100, areaNLA: 90, category: 'Technology', baseRent: 900000, cam: 110000 },
    // L2 units
    { floorIdx: 2, zone: 'A', code: 'L2-A01', areaGFA: 400, areaNLA: 360, category: 'F&B', baseRent: 800000, cam: 100000 },
    { floorIdx: 2, zone: 'A', code: 'L2-A02', areaGFA: 350, areaNLA: 315, category: 'F&B', baseRent: 800000, cam: 100000 },
    { floorIdx: 2, zone: 'B', code: 'L2-B01', areaGFA: 500, areaNLA: 450, category: 'Entertainment', baseRent: 600000, cam: 80000 },
    { floorIdx: 2, zone: 'C', code: 'L2-C01', areaGFA: 120, areaNLA: 108, category: 'F&B', baseRent: 750000, cam: 90000 },
    { floorIdx: 2, zone: 'C', code: 'L2-C02', areaGFA: 160, areaNLA: 144, category: 'Health & Beauty', baseRent: 750000, cam: 90000 },
    { floorIdx: 2, zone: 'D', code: 'L2-D01', areaGFA: 200, areaNLA: 180, category: 'Fashion', baseRent: 700000, cam: 85000 },
    // L3 units
    { floorIdx: 3, zone: 'A', code: 'L3-A01', areaGFA: 800, areaNLA: 720, category: 'Entertainment', baseRent: 500000, cam: 70000 },
    { floorIdx: 3, zone: 'B', code: 'L3-B01', areaGFA: 250, areaNLA: 225, category: 'F&B', baseRent: 700000, cam: 85000 },
    { floorIdx: 3, zone: 'B', code: 'L3-B02', areaGFA: 300, areaNLA: 270, category: 'F&B', baseRent: 700000, cam: 85000 },
    { floorIdx: 3, zone: 'C', code: 'L3-C01', areaGFA: 150, areaNLA: 135, category: 'Fashion', baseRent: 650000, cam: 80000 },
    { floorIdx: 3, zone: 'D', code: 'L3-D01', areaGFA: 180, areaNLA: 162, category: 'Technology', baseRent: 700000, cam: 85000 },
    { floorIdx: 3, zone: 'E', code: 'L3-E01', areaGFA: 220, areaNLA: 198, category: 'Fashion', baseRent: 650000, cam: 80000 },
    // L4 units
    { floorIdx: 4, zone: 'A', code: 'L4-A01', areaGFA: 1200, areaNLA: 1080, category: 'Entertainment', baseRent: 400000, cam: 60000 },
    { floorIdx: 4, zone: 'B', code: 'L4-B01', areaGFA: 350, areaNLA: 315, category: 'F&B', baseRent: 600000, cam: 75000 },
    { floorIdx: 4, zone: 'B', code: 'L4-B02', areaGFA: 400, areaNLA: 360, category: 'F&B', baseRent: 600000, cam: 75000 },
    { floorIdx: 4, zone: 'C', code: 'L4-C01', areaGFA: 200, areaNLA: 180, category: 'Fashion', baseRent: 550000, cam: 70000 },
    { floorIdx: 4, zone: 'D', code: 'L4-D01', areaGFA: 160, areaNLA: 144, category: 'F&B', baseRent: 580000, cam: 72000 },
    { floorIdx: 4, zone: 'E', code: 'L4-E01', areaGFA: 140, areaNLA: 126, category: 'Health & Beauty', baseRent: 560000, cam: 70000 },
  ];

  const units = [];
  for (let i = 0; i < unitConfigs.length; i++) {
    const cfg = unitConfigs[i];
    const floor = floors[cfg.floorIdx];
    const zoneEntry = allZones.find(
      (z) => z.floor.id === floor.id && z.zone.code === `${floor.level}-${cfg.zone}`
    );

    // Assign first 10 units to tenants
    const tenantId = i < 10 ? tenants[i].id : null;
    const status = i < 10 ? UnitStatus.OCCUPIED : i < 15 ? UnitStatus.UNDER_FITOUT : i < 20 ? UnitStatus.BOOKING : UnitStatus.VACANT;

    // Map category string to categoryId
    const categoryMap: Record<string, string> = {
      'F&B': 'FNB',
      'Fashion': 'FASHION',
      'Health & Beauty': 'BEAUTY',
      'Technology': 'TECH',
      'Entertainment': 'ENTERTAINMENT',
      'Convenience Store': 'CONVENIENCE',
      'Supermarket': 'SUPERMARKET',
    };
    const categoryCode = categoryMap[cfg.category] || null;
    const categoryId = categoryCode ? categories[categoryCode]?.id : null;

    const unit = await prisma.unit.create({
      data: {
        mallId: mall.id,
        buildingId: building.id,
        floorId: floor.id,
        zoneId: zoneEntry?.zone.id,
        code: cfg.code,
        name: `Unit ${cfg.code}`,
        areaGFA: cfg.areaGFA,
        areaNLA: cfg.areaNLA,
        category: cfg.category,
        categoryId: categoryId,
        baseRentPerSqm: cfg.baseRent,
        camPerSqm: cfg.cam,
        status: status,
        tenantId: tenantId,
        leaseStartDate: tenantId ? new Date('2024-01-01') : null,
        leaseEndDate: tenantId ? new Date('2026-12-31') : null,
        isActive: true,
      },
    });
    units.push(unit);
  }

  console.log('Units created');

  // Create Leads (20 leads)
  const leadStatuses = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL, LeadStatus.NEGOTIATION, LeadStatus.WON, LeadStatus.LOST];
  const leadSources = [LeadSource.BROKER, LeadSource.WEBSITE, LeadSource.REFERRAL, LeadSource.WALK_IN, LeadSource.EXISTING_TENANT];

  const leadsData = [
    { brandName: 'KFC Vietnam', company: 'KFC Vietnam Co., Ltd', contactName: 'Robert Brown', email: 'robert@kfc.com.vn', phone: '0291234567', status: LeadStatus.NEGOTIATION, source: LeadSource.BROKER, category: 'F&B', expectedRent: 900000, expectedArea: 200, priority: LeadPriority.HOT, estimatedValue: 180000000, position: 0 },
    { brandName: 'Zara Vietnam', company: 'Inditex Vietnam', contactName: 'Carlos Rodriguez', email: 'carlos@zara.com.vn', phone: '0291234568', status: LeadStatus.PROPOSAL, source: LeadSource.WEBSITE, category: 'Fashion', expectedRent: 800000, expectedArea: 300, priority: LeadPriority.HOT, estimatedValue: 240000000, position: 0 },
    { brandName: 'Starbucks', company: 'Starbucks Vietnam', contactName: 'Sarah Johnson', email: 'sarah@starbucks.com.vn', phone: '0291234569', status: LeadStatus.QUALIFIED, source: LeadSource.REFERRAL, category: 'F&B', expectedRent: 1100000, expectedArea: 150, priority: LeadPriority.HOT, estimatedValue: 165000000, position: 0 },
    { brandName: 'H&M Vietnam', company: 'H&M Vietnam Co.', contactName: 'Erik Svensson', email: 'erik@hm.com.vn', phone: '0291234570', status: LeadStatus.CONTACTED, source: LeadSource.WEBSITE, category: 'Fashion', expectedRent: 750000, expectedArea: 400, priority: LeadPriority.WARM, estimatedValue: 300000000, position: 0 },
    { brandName: 'Pizza Hut', company: 'Pizza Hut Vietnam', contactName: 'David Lee', email: 'david@pizzahut.com.vn', phone: '0291234571', status: LeadStatus.NEW, source: LeadSource.WALK_IN, category: 'F&B', expectedRent: 850000, expectedArea: 180, priority: LeadPriority.WARM, estimatedValue: 153000000, position: 0 },
    { brandName: 'Watsons', company: 'AS Watson Vietnam', contactName: 'Michelle Tan', email: 'michelle@watsons.com.vn', phone: '0291234572', status: LeadStatus.NEGOTIATION, source: LeadSource.BROKER, category: 'Health & Beauty', expectedRent: 850000, expectedArea: 200, priority: LeadPriority.WARM, estimatedValue: 170000000, position: 1 },
    { brandName: 'Vincom Retail', company: 'Vincom Retail JSC', contactName: 'Nguyen Van Binh', email: 'binh@vincom.vn', phone: '0291234573', status: LeadStatus.WON, source: LeadSource.EXISTING_TENANT, category: 'Entertainment', expectedRent: 500000, expectedArea: 1000, priority: LeadPriority.HOT, estimatedValue: 500000000, position: 0 },
    { brandName: 'Butter Me Up', company: 'BMU Vietnam', contactName: 'Phan Thu Ha', email: 'ha@buttermeup.vn', phone: '0291234574', status: LeadStatus.LOST, source: LeadSource.WALK_IN, category: 'F&B', expectedRent: 900000, expectedArea: 80, priority: LeadPriority.COLD, estimatedValue: 72000000, position: 0, lostReason: 'Budget constraints - found cheaper alternative' },
    { brandName: 'CellphoneS', company: 'CellphoneS JSC', contactName: 'Tran Minh Quan', email: 'quan@cellphones.com.vn', phone: '0291234575', status: LeadStatus.QUALIFIED, source: LeadSource.REFERRAL, category: 'Technology', expectedRent: 750000, expectedArea: 120, priority: LeadPriority.WARM, estimatedValue: 90000000, position: 1 },
    { brandName: 'Phuc Long Coffee', company: 'Phuc Long Heritage', contactName: 'Le Quoc Hung', email: 'hung@phuclong.com.vn', phone: '0291234576', status: LeadStatus.PROPOSAL, source: LeadSource.BROKER, category: 'F&B', expectedRent: 950000, expectedArea: 160, priority: LeadPriority.HOT, estimatedValue: 152000000, position: 1 },
    { brandName: 'ALDO', company: 'ALDO Vietnam', contactName: 'Michel Leblanc', email: 'michel@aldo.com.vn', phone: '0291234577', status: LeadStatus.NEW, source: LeadSource.WEBSITE, category: 'Fashion', expectedRent: 800000, expectedArea: 100, priority: LeadPriority.COLD, estimatedValue: 80000000, position: 1 },
    { brandName: 'Gym Master', company: 'Gym Master Vietnam', contactName: 'Vo Thanh Long', email: 'long@gymmaster.vn', phone: '0291234578', status: LeadStatus.CONTACTED, source: LeadSource.WALK_IN, category: 'Entertainment', expectedRent: 600000, expectedArea: 500, priority: LeadPriority.WARM, estimatedValue: 300000000, position: 1 },
    { brandName: 'Paris Baguette', company: 'SPC Vietnam', contactName: 'Park Jin Soo', email: 'jinsoo@parisbaguette.vn', phone: '0291234579', status: LeadStatus.NEGOTIATION, source: LeadSource.BROKER, category: 'F&B', expectedRent: 1000000, expectedArea: 130, priority: LeadPriority.HOT, estimatedValue: 130000000, position: 2 },
    { brandName: 'Miniso', company: 'Miniso Vietnam', contactName: 'Zhang Wei', email: 'zhang@miniso.com.vn', phone: '0291234580', status: LeadStatus.QUALIFIED, source: LeadSource.WEBSITE, category: 'Fashion', expectedRent: 700000, expectedArea: 200, priority: LeadPriority.COLD, estimatedValue: 140000000, position: 2 },
    { brandName: 'Baskin Robbins', company: 'Baskin Robbins Vietnam', contactName: 'Tom Anderson', email: 'tom@baskinrobbins.com.vn', phone: '0291234581', status: LeadStatus.CONTACTED, source: LeadSource.REFERRAL, category: 'F&B', expectedRent: 850000, expectedArea: 60, priority: LeadPriority.COLD, estimatedValue: 51000000, position: 2 },
    { brandName: 'Sephora', company: 'LVMH Beauty Vietnam', contactName: 'Isabelle Martin', email: 'isabelle@sephora.com.vn', phone: '0291234582', status: LeadStatus.PROPOSAL, source: LeadSource.BROKER, category: 'Health & Beauty', expectedRent: 950000, expectedArea: 250, priority: LeadPriority.HOT, estimatedValue: 237500000, position: 2 },
    { brandName: 'CGV Cinemas', company: 'CJ CGV Vietnam', contactName: 'Kim Dong Hyun', email: 'donghyun@cgv.vn', phone: '0291234583', status: LeadStatus.NEGOTIATION, source: LeadSource.BROKER, category: 'Entertainment', expectedRent: 450000, expectedArea: 2000, priority: LeadPriority.HOT, estimatedValue: 900000000, position: 3 },
    { brandName: 'Tous Les Jours', company: 'CJ Foodville Vietnam', contactName: 'Park Soo Yeon', email: 'sooyeon@tousslesjours.vn', phone: '0291234584', status: LeadStatus.NEW, source: LeadSource.WALK_IN, category: 'F&B', expectedRent: 900000, expectedArea: 100, priority: LeadPriority.WARM, estimatedValue: 90000000, position: 2 },
    { brandName: 'Nike Vietnam', company: 'Blue Lagoon Vietnam', contactName: 'Jason Miller', email: 'jason@nike.com.vn', phone: '0291234585', status: LeadStatus.LOST, source: LeadSource.WEBSITE, category: 'Fashion', expectedRent: 850000, expectedArea: 300, priority: LeadPriority.HOT, estimatedValue: 255000000, position: 1, lostReason: 'Chose another location - AEON Mall' },
    { brandName: 'Aeon MaxValu', company: 'Aeon Vietnam', contactName: 'Yamamoto Kenji', email: 'kenji@aeon.com.vn', phone: '0291234586', status: LeadStatus.QUALIFIED, source: LeadSource.BROKER, category: 'Supermarket', expectedRent: 350000, expectedArea: 3000, priority: LeadPriority.HOT, estimatedValue: 1050000000, position: 3 },
  ];

  const leads = [];
  const now = new Date();
  for (let i = 0; i < leadsData.length; i++) {
    // Set expectedCloseDate based on status
    let expectedCloseDate: Date | null = null;
    if (!['WON', 'LOST'].includes(leadsData[i].status)) {
      expectedCloseDate = new Date(now);
      expectedCloseDate.setDate(expectedCloseDate.getDate() + (i % 5 + 1) * 15); // 15-75 days from now
    }
    // Set lastActivityAt to simulate recent/stale leads
    const lastActivityAt = new Date(now);
    lastActivityAt.setDate(lastActivityAt.getDate() - (i % 10)); // 0-9 days ago

    const lead = await prisma.lead.create({
      data: {
        ...leadsData[i],
        assignedToId: i % 2 === 0 ? leasingExec.id : leasingManager.id,
        // Link first 10 leads to matching Customer profiles in CRM
        customerId: i < 10 ? customers[i % 10].id : null,
        expectedCloseDate,
        lastActivityAt,
        isActive: true,
      },
    });
    leads.push(lead);

    // Add activities
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'CALL',
        note: `Initial call with ${leadsData[i].contactName}. Discussed space requirements and rental terms.`,
        createdById: leasingExec.id,
      },
    });

    if (i % 3 === 0) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'MEETING',
          note: `Site visit conducted. Tenant interested in ${leadsData[i].expectedArea}sqm on preferred floor.`,
          createdById: leasingManager.id,
        },
      });
    }
  }

  console.log('Leads created');

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIT BOOKINGS — units 15-19 have BOOKING status, create matching records
  // Pipeline: Customer → Lead → UnitBooking → Proposal → Contract → Tenant
  // ═══════════════════════════════════════════════════════════════════════════
  // units[15]=L2-C01(F&B 120m²), [16]=L2-C02(H&B 160m²), [17]=L2-D01(Fashion 200m²),
  // [18]=L3-A01(Entertainment 800m²), [19]=L3-B01(F&B 250m²)
  const bookingExpiresBase = new Date(now);
  bookingExpiresBase.setDate(bookingExpiresBase.getDate() + 30);

  const bookingsConfig = [
    // unit 15 (F&B 120m²) — Starbucks (lead idx 2, QUALIFIED→NEGOTIATION)
    { unitIdx: 15, leadIdx: 2, customerIdx: 2, status: BookingStatus.ACTIVE, priority: 1, requestedArea: 150, requestedTerm: 36, expectedRent: 1100000, holdDays: 30, notes: 'Starbucks đang thương thảo giá thuê tầng 2', bookingNo: 'BK-2026-00001' },
    // unit 16 (H&B 160m²) — Watsons (lead idx 5, NEGOTIATION)
    { unitIdx: 16, leadIdx: 5, customerIdx: 5, status: BookingStatus.ACTIVE, priority: 1, requestedArea: 200, requestedTerm: 24, expectedRent: 850000, holdDays: 30, notes: 'Watsons đang chờ phê duyệt giá nội bộ', bookingNo: 'BK-2026-00002' },
    // unit 17 (Fashion 200m²) — Zara (ACTIVE priority 1), H&M (PENDING priority 2 — waitlist)
    { unitIdx: 17, leadIdx: 1, customerIdx: 1, status: BookingStatus.ACTIVE, priority: 1, requestedArea: 300, requestedTerm: 36, expectedRent: 800000, holdDays: 30, notes: 'Zara ưu tiên số 1', bookingNo: 'BK-2026-00003' },
    { unitIdx: 17, leadIdx: 3, customerIdx: 3, status: BookingStatus.PENDING, priority: 2, requestedArea: 400, requestedTerm: 24, expectedRent: 750000, holdDays: 30, notes: 'H&M chờ hàng — ưu tiên số 2', bookingNo: 'BK-2026-00004' },
    // unit 18 (Entertainment 800m²) — CGV (lead idx 16, NEGOTIATION)
    { unitIdx: 18, leadIdx: 16, customerIdx: 6, status: BookingStatus.ACTIVE, priority: 1, requestedArea: 2000, requestedTerm: 60, expectedRent: 450000, holdDays: 45, notes: 'CGV đang đàm phán hợp đồng rạp phim', bookingNo: 'BK-2026-00005' },
    // unit 19 (F&B 250m²) — Paris Baguette (lead idx 12, NEGOTIATION)
    { unitIdx: 19, leadIdx: 12, customerIdx: 8, status: BookingStatus.ACTIVE, priority: 1, requestedArea: 130, requestedTerm: 36, expectedRent: 1000000, holdDays: 30, notes: 'Paris Baguette — đã chốt diện tích, chờ ký đề xuất', bookingNo: 'BK-2026-00006' },
  ];

  const bookings = [];
  for (const bc of bookingsConfig) {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + bc.holdDays);
    const activatedAt = bc.status === BookingStatus.ACTIVE ? new Date(now.getTime() - 3 * 86400000) : null;

    const booking = await prisma.unitBooking.create({
      data: {
        bookingNumber: bc.bookingNo,
        unitId: units[bc.unitIdx].id,
        leadId: leads[bc.leadIdx].id,
        customerId: customers[bc.customerIdx].id,
        status: bc.status,
        priority: bc.priority,
        requestedArea: bc.requestedArea,
        requestedTerm: bc.requestedTerm,
        expectedRent: bc.expectedRent,
        holdDays: bc.holdDays,
        expiresAt,
        activatedAt,
        notes: bc.notes,
        createdById: leasingExec.id,
        assignedToId: leasingExec.id,
        isActive: true,
      },
    });
    bookings.push(booking);

    // Activity log
    await prisma.bookingActivity.create({
      data: {
        booking: { connect: { id: booking.id } },
        type: BookingActivityType.CREATED,
        note: `Booking ${bc.bookingNo} được tạo bởi sale`,
        performedBy: { connect: { id: leasingExec.id } },
      },
    });
    if (bc.status === BookingStatus.ACTIVE) {
      await prisma.bookingActivity.create({
        data: {
          booking: { connect: { id: booking.id } },
          type: BookingActivityType.ACTIVATED,
          note: 'Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING',
          performedBy: { connect: { id: leasingManager.id } },
        },
      });
    }
  }

  console.log('Unit bookings created');

  // Create Proposals (for qualified/proposal/negotiation leads)
  const proposals = [];
  const proposalLeads = leads.filter((l, i) => ([LeadStatus.PROPOSAL, LeadStatus.NEGOTIATION, LeadStatus.WON] as string[]).includes(leadsData[i].status));

  for (let i = 0; i < Math.min(proposalLeads.length, 8); i++) {
    const lead = proposalLeads[i];
    const unit = units[20 + i] || units[i];
    const rentPerSqm = unit.baseRentPerSqm;
    const area = unit.areaNLA;
    const monthlyRent = area * rentPerSqm;
    const monthlyCAM = area * unit.camPerSqm;
    const depositMonths = 3;
    const depositAmount = monthlyRent * depositMonths;
    const term = 36;
    const totalContractValue = monthlyRent * term;

    const proposal = await prisma.proposal.create({
      data: {
        proposalNumber: `PROP-2026-${String(i + 1).padStart(4, '0')}`,
        leadId: lead.id,
        tenantId: tenants[i % 10].id,
        unitId: unit.id,
        area: area,
        term: term,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2029-06-30'),
        rentPerSqm: rentPerSqm,
        camPerSqm: unit.camPerSqm,
        deposit: depositMonths,
        rentFree: i % 3 === 0 ? 30 : 0,
        escalationPercent: 5,
        revenueSharePercent: 0,
        marketingFee: 0,
        monthlyRent: monthlyRent,
        monthlyCAM: monthlyCAM,
        depositAmount: depositAmount,
        totalContractValue: totalContractValue,
        discount: i % 4 === 0 ? 8 : i % 4 === 1 ? 3 : 0,
        status: i < 2 ? ProposalStatus.APPROVED : i < 4 ? ProposalStatus.UNDER_REVIEW : i < 6 ? ProposalStatus.SUBMITTED : ProposalStatus.DRAFT,
        createdById: leasingExec.id,
        notes: 'Standard lease proposal',
        isActive: true,
      },
    });
    proposals.push(proposal);
  }

  console.log('Proposals created');

  // Create Contracts (15 contracts)
  const contractStatuses = [
    ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE,
    ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE, ContractStatus.ACTIVE,
    ContractStatus.EXPIRING, ContractStatus.EXPIRING,
    ContractStatus.PENDING_SIGNATURE,
    ContractStatus.DRAFT, ContractStatus.DRAFT,
  ];

  const contracts = [];
  for (let i = 0; i < 15; i++) {
    const tenant = tenants[i % 10];
    const unit = units[i < 10 ? i : i % 10];
    const rent = unit.baseRentPerSqm * unit.areaNLA;
    const cam = unit.camPerSqm * unit.areaNLA;
    const deposit = rent * 3;

    const isExpiring = i === 10 || i === 11;
    const startDate = isExpiring ? new Date('2024-01-01') : new Date('2024-06-01');
    const endDate = isExpiring ? new Date('2026-08-31') : new Date('2027-05-31');

    const contract = await prisma.contract.create({
      data: {
        contractNumber: `CTR-2026-${String(i + 1).padStart(4, '0')}`,
        proposalId: i < proposals.length ? proposals[i].id : null,
        tenantId: tenant.id,
        unitId: unit.id,
        type: ContractType.LEASE_AGREEMENT,
        status: contractStatuses[i],
        startDate: startDate,
        endDate: endDate,
        term: 36,
        rent: rent,
        cam: cam,
        deposit: deposit,
        billingCycle: BillingCycle.MONTHLY,
        paymentTerm: 30,
        rentFree: 0,
        escalationPercent: 5,
        managedById: leasingManager.id,
        notes: `Lease agreement for ${tenant.brandName} at unit ${unit.code}`,
        isActive: true,
      },
    });
    contracts.push(contract);
  }

  console.log('Contracts created');

  // Create FitoutProjects for active contracts (status = FitoutStageConfig.code, seeded in migration 20260702100000)
  const fitoutStatuses = [
    'OPENED', 'OPENED', 'OPENED', 'OPENED',
    'APPROVED_TO_OPEN', 'INSPECTION',
    'FITOUT_IN_PROGRESS', 'CONSTRUCTION_PERMIT',
    'DESIGN_REVIEW', 'SUBMIT_DESIGN',
    'CONTRACT_SIGNED', 'CONTRACT_SIGNED',
  ];

  for (let i = 0; i < Math.min(contracts.length, 12); i++) {
    const contract = contracts[i];
    const fitout = await prisma.fitoutProject.create({
      data: {
        contractId: contract.id,
        tenantId: contract.tenantId,
        unitId: contract.unitId,
        status: fitoutStatuses[i],
        handoverDate: new Date('2024-01-15'),
        startDate: new Date('2024-02-01'),
        expectedOpenDate: new Date('2024-04-01'),
        actualOpenDate: i < 4 ? new Date('2024-04-15') : null,
        operationManagerId: operationUser.id,
        notes: 'Fitout project in progress',
      },
    });

    // Add checklists
    const checklistItems = [
      'Submit design drawings',
      'Fire safety review',
      'Structural approval',
      'MEP installation',
      'Interior fit-out',
      'Safety inspection',
      'Final walkthrough',
    ];

    for (let j = 0; j < checklistItems.length; j++) {
      await prisma.fitoutChecklist.create({
        data: {
          projectId: fitout.id,
          title: checklistItems[j],
          description: `Complete ${checklistItems[j].toLowerCase()} per mall guidelines`,
          isCompleted: i < 4 ? true : j < i - 4,
          completedById: i < 4 ? operationUser.id : null,
          completedAt: i < 4 ? new Date('2024-03-01') : null,
          order: j,
        },
      });
    }
  }

  console.log('Fitout projects created');

  // Create Invoices (30 invoices)
  const periods = ['2026-03', '2026-04', '2026-05'];
  const invoiceStatuses = [InvoiceStatus.PAID, InvoiceStatus.PAID, InvoiceStatus.PAID, InvoiceStatus.PAID,
    InvoiceStatus.ISSUED, InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.OVERDUE,
    InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.DRAFT];

  let invoiceCount = 0;
  const invoices = [];

  for (const period of periods) {
    for (let i = 0; i < 10; i++) {
      const contract = contracts[i % 10];
      const tenant = await prisma.tenant.findUnique({ where: { id: contract.tenantId } });
      const unit = await prisma.unit.findUnique({ where: { id: contract.unitId } });
      const subtotal = contract.rent + contract.cam;
      const vatAmount = subtotal * 0.1;
      const totalAmount = subtotal + vatAmount;
      const [year, month] = period.split('-');
      const dueDate = new Date(`${year}-${month}-15`);

      invoiceCount++;
      const statusIdx = invoiceCount % invoiceStatuses.length;
      const status = invoiceStatuses[statusIdx];

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${period}-${String(invoiceCount).padStart(4, '0')}`,
          contractId: contract.id,
          tenantId: contract.tenantId,
          period: period,
          type: InvoiceType.MONTHLY_RENT,
          status: status,
          subtotal: subtotal,
          vatRate: 10,
          vatAmount: vatAmount,
          totalAmount: totalAmount,
          dueDate: dueDate,
          issuedAt: status !== InvoiceStatus.DRAFT ? new Date(`${year}-${month}-01`) : null,
          paidAt: status === InvoiceStatus.PAID ? new Date(`${year}-${month}-10`) : null,
          notes: `Monthly rent invoice for ${period}`,
          isActive: true,
        },
      });
      invoices.push(invoice);

      // Add invoice lines
      await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          type: 'RENT',
          description: `Base rent - ${period} - Unit ${unit?.code}`,
          qty: 1,
          unitPrice: contract.rent,
          amount: contract.rent,
          order: 0,
        },
      });

      await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          type: 'CAM',
          description: `CAM charge - ${period} - Unit ${unit?.code}`,
          qty: 1,
          unitPrice: contract.cam,
          amount: contract.cam,
          order: 1,
        },
      });

      // Add payment for PAID invoices
      if (status === InvoiceStatus.PAID) {
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            tenantId: contract.tenantId,
            amount: totalAmount,
            method: PaymentMethod.BANK_TRANSFER,
            reference: `TXN-${period}-${String(invoiceCount).padStart(4, '0')}`,
            paidAt: new Date(`${year}-${month}-10`),
            notes: 'Full payment received',
          },
        });
      } else if (status === InvoiceStatus.PARTIALLY_PAID) {
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            tenantId: contract.tenantId,
            amount: totalAmount * 0.5,
            method: PaymentMethod.BANK_TRANSFER,
            reference: `TXN-PARTIAL-${period}-${String(invoiceCount).padStart(4, '0')}`,
            paidAt: new Date(`${year}-${month}-12`),
            notes: 'Partial payment received',
          },
        });
      }
    }
  }

  console.log('Invoices created');

  // Create Tickets (20 tickets)
  const ticketTypes = [TicketType.ELECTRICAL, TicketType.WATER, TicketType.HVAC, TicketType.CLEANING, TicketType.SECURITY, TicketType.PARKING, TicketType.INTERNET, TicketType.OTHER];
  const ticketStatuses = [TicketStatus.NEW, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.WAITING_TENANT];

  for (let i = 0; i < 20; i++) {
    const tenant = tenants[i % 10];
    const unit = units[i % 10];
    const type = ticketTypes[i % ticketTypes.length];
    const status = ticketStatuses[i % ticketStatuses.length];
    const priority = i % 4 === 0 ? TicketPriority.URGENT : i % 3 === 0 ? TicketPriority.HIGH : i % 2 === 0 ? TicketPriority.MEDIUM : TicketPriority.LOW;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-${String(i + 1).padStart(4, '0')}`,
        tenantId: tenant.id,
        unitId: unit.id,
        type: type,
        priority: priority,
        sla: priority === TicketPriority.URGENT ? 4 : priority === TicketPriority.HIGH ? 8 : 24,
        subject: `${type.replace('_', ' ')} issue in unit ${unit.code}`,
        description: `Tenant reported ${type.toLowerCase().replace('_', ' ')} problem. Needs immediate attention.`,
        assignedToId: i % 2 === 0 ? operationUser.id : null,
        status: status,
        resolvedAt: status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED ? new Date('2026-05-15') : null,
        closedAt: status === TicketStatus.CLOSED ? new Date('2026-05-16') : null,
        isActive: true,
      },
    });

    // Add comments
    await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        userId: leasingExec.id,
        content: 'Ticket received and being reviewed by operations team.',
        isInternal: false,
      },
    });

    if (status !== TicketStatus.NEW) {
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          userId: operationUser.id,
          content: 'Operations team dispatched to investigate the issue.',
          isInternal: true,
        },
      });
    }
  }

  console.log('Tickets created');

  // Create Sales Turnover for 3 months
  const salesPeriods = ['2026-03', '2026-04', '2026-05'];
  for (const period of salesPeriods) {
    for (let i = 0; i < 10; i++) {
      const tenant = tenants[i];
      const unit = units[i];
      const grossSales = Math.floor(Math.random() * 500000000) + 100000000;
      const netSales = grossSales * 0.9;
      const [year, month] = period.split('-');

      await prisma.salesTurnover.create({
        data: {
          tenantId: tenant.id,
          unitId: unit.id,
          date: new Date(`${year}-${month}-01`),
          period: period,
          grossSales: grossSales,
          netSales: netSales,
          transactions: Math.floor(Math.random() * 2000) + 500,
          recordedById: financeUser.id,
          notes: `Sales report for ${period}`,
        },
      });
    }
  }

  console.log('Sales turnover created');

  const approvalRules = await prisma.approvalPolicyRule.findMany({
    where: { isActive: true },
    orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const roleUserMap: Record<string, string> = {
    [Role.LEASING_MANAGER]: leasingManager.id,
    [Role.MALL_DIRECTOR]: mallDirector.id,
    [Role.CEO]: ceoUser.id,
    [Role.FINANCE]: financeUser.id,
    [Role.LEGAL]: legalUser.id,
  };

  // Create Approval Workflows for proposals (policy-driven)
  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
    if (proposal.status === ProposalStatus.SUBMITTED || proposal.status === ProposalStatus.UNDER_REVIEW || proposal.status === ProposalStatus.APPROVED) {
      const workflow = await prisma.approvalWorkflow.create({
        data: {
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          proposalId: proposal.id,
          status: proposal.status === ProposalStatus.APPROVED ? 'APPROVED' : 'IN_PROGRESS',
        },
      });

      const steps = buildApprovalStepsFromRules(approvalRules, {
        discountPct: proposal.discount ?? 0,
        rentFreeDays: proposal.rentFree ?? 0,
        industryTag: null,
        hasArDebt: false,
      });

      for (const step of steps) {
        await prisma.approvalStep.create({
          data: {
            workflowId: workflow.id,
            stepOrder: step.stepOrder,
            stepName: step.stepName,
            approverRole: step.approverRole,
            approverId: roleUserMap[step.approverRole] ?? leasingManager.id,
            status: proposal.status === ProposalStatus.APPROVED ? 'APPROVED' : 'PENDING',
            comment: proposal.status === ProposalStatus.APPROVED ? 'Approved' : null,
            decidedAt: proposal.status === ProposalStatus.APPROVED ? new Date() : null,
          },
        });
      }
    }
  }

  console.log('Approval workflows created');
  console.log(`Contract template seeded: ${leaseTemplate.code}`);

  // Create Notifications
  for (let i = 0; i < 10; i++) {
    await prisma.notification.create({
      data: {
        userId: leasingManager.id,
        title: 'New Proposal Submitted',
        body: `Proposal PROP-2026-${String(i + 1).padStart(4, '0')} has been submitted for review.`,
        type: 'PROPOSAL_SUBMITTED',
        entityType: 'PROPOSAL',
        entityId: proposals[i % proposals.length].id,
        isRead: i < 5,
      },
    });
  }

  for (let i = 0; i < 5; i++) {
    await prisma.notification.create({
      data: {
        userId: financeUser.id,
        title: 'Invoice Overdue',
        body: `Invoice has been overdue for more than 30 days.`,
        type: 'INVOICE_OVERDUE',
        entityType: 'INVOICE',
        entityId: invoices[i].id,
        isRead: false,
      },
    });
  }

  // Create Audit Logs
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'CREATE',
      entityType: 'MALL',
      entityId: mall.id,
      newValue: JSON.stringify({ name: mall.name, code: mall.code }),
      ipAddress: '192.168.1.1',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: leasingManager.id,
      action: 'UPDATE',
      entityType: 'CONTRACT',
      entityId: contracts[0].id,
      oldValue: JSON.stringify({ status: 'DRAFT' }),
      newValue: JSON.stringify({ status: 'ACTIVE' }),
      ipAddress: '192.168.1.10',
    },
  });

  console.log('Notifications and audit logs created');

  // ═══════════════════════════════════════════════════════════════════════════
  // WAVE 4-5 SEED DATA
  // ═══════════════════════════════════════════════════════════════════════════

  // Fitout Document Gates (stage/documentType = FitoutStageConfig.code / FitoutFormType.code)
  const documentGates = [
    { stage: 'SUBMIT_DESIGN', documentType: 'DESIGN_DRAWING', description: 'Layout design drawings', order: 1 },
    { stage: 'SUBMIT_DESIGN', documentType: 'MEP_DRAWING', description: 'MEP (M&E) drawings', order: 2 },
    { stage: 'FIRE_SAFETY_REVIEW', documentType: 'FIRE_SAFETY_CERT', description: 'Fire safety certificate', order: 1 },
    { stage: 'FIRE_SAFETY_REVIEW', documentType: 'PCCC_APPROVAL', description: 'PCCC approval document', order: 2 },
    { stage: 'CONSTRUCTION_PERMIT', documentType: 'CONSTRUCTION_PERMIT', description: 'Construction permit', order: 1 },
    { stage: 'CONSTRUCTION_PERMIT', documentType: 'INSURANCE_CERT', description: 'Insurance certificate', order: 2 },
    { stage: 'INSPECTION', documentType: 'INSPECTION_REPORT', description: 'Final inspection report', order: 1 },
    { stage: 'APPROVED_TO_OPEN', documentType: 'HANDOVER_FORM', description: 'Handover acceptance form', order: 1 },
  ];

  for (const gate of documentGates) {
    await prisma.fitoutDocumentGate.create({
      data: { ...gate, isRequired: true, isActive: true },
    });
  }
  console.log('Fitout document gates created');

  // Fitout SLA Policies
  const fitoutSlaPolicies = [
    { stage: 'CONTRACT_SIGNED', targetDays: 7, warningDays: 5, escalateToRole: Role.LEASING_MANAGER },
    { stage: 'SUBMIT_DESIGN', targetDays: 14, warningDays: 10, escalateToRole: Role.LEASING_MANAGER },
    { stage: 'DESIGN_REVIEW', targetDays: 7, warningDays: 5, escalateToRole: Role.OPERATION },
    { stage: 'FIRE_SAFETY_REVIEW', targetDays: 14, warningDays: 10, escalateToRole: Role.OPERATION },
    { stage: 'CONSTRUCTION_PERMIT', targetDays: 7, warningDays: 5, escalateToRole: Role.OPERATION },
    { stage: 'FITOUT_IN_PROGRESS', targetDays: 60, warningDays: 45, escalateToRole: Role.MALL_DIRECTOR },
    { stage: 'INSPECTION', targetDays: 7, warningDays: 5, escalateToRole: Role.OPERATION },
    { stage: 'APPROVED_TO_OPEN', targetDays: 3, warningDays: 2, escalateToRole: Role.MALL_DIRECTOR },
  ];

  for (const policy of fitoutSlaPolicies) {
    await prisma.fitoutSlaPolicy.create({
      data: { ...policy, isActive: true },
    });
  }
  console.log('Fitout SLA policies created');

  // Ticket SLA Policies (type × priority matrix)
  const ticketSlaTypes = [TicketType.ELECTRICAL, TicketType.WATER, TicketType.HVAC, TicketType.CLEANING, TicketType.SECURITY, TicketType.OTHER];
  const ticketSlaPolicies: Array<{ ticketType: TicketType; priority: TicketPriority; responseHours: number; resolutionHours: number; escalateToRole: Role }> = [];

  for (const type of ticketSlaTypes) {
    ticketSlaPolicies.push(
      { ticketType: type, priority: TicketPriority.URGENT, responseHours: 1, resolutionHours: 4, escalateToRole: Role.MALL_DIRECTOR },
      { ticketType: type, priority: TicketPriority.HIGH, responseHours: 2, resolutionHours: 8, escalateToRole: Role.LEASING_MANAGER },
      { ticketType: type, priority: TicketPriority.MEDIUM, responseHours: 4, resolutionHours: 24, escalateToRole: Role.OPERATION },
      { ticketType: type, priority: TicketPriority.LOW, responseHours: 8, resolutionHours: 72, escalateToRole: Role.OPERATION },
    );
  }

  for (const policy of ticketSlaPolicies) {
    await prisma.ticketSlaPolicy.create({
      data: { ...policy, isActive: true },
    });
  }
  console.log('Ticket SLA policies created');

  // Mall Policy (governance)
  await prisma.mallPolicy.create({
    data: {
      mallId: mall.id,
      policies: {
        maxDiscountPct: 15,
        maxRentFreeDays: 60,
        requireLegalForDiscount: 10,
        requireCeoForDiscount: 20,
        minLeaseTermMonths: 12,
        fitoutDeadlineDays: 90,
        invoicePaymentTermDays: 30,
      },
      kpiTargets: {
        occupancyRate: 95,
        collectionRate: 98,
        dsoTarget: 30,
        renewalRate: 85,
        fitoutOnTimeRate: 90,
        ticketSlaCompliance: 95,
      },
      isActive: true,
    },
  });
  console.log('Mall policy created');

  // Sample Occupancy Snapshot (historical data)
  const snapshotNow = new Date();
  for (let m = 5; m >= 0; m--) {
    const snapshotDate = new Date(snapshotNow.getFullYear(), snapshotNow.getMonth() - m, 1);
    const period = `${snapshotDate.getFullYear()}-${String(snapshotDate.getMonth() + 1).padStart(2, '0')}`;
    const baseOccupancy = 85 + Math.random() * 10;
    const totalUnits = 50;
    const totalArea = 10000;
    const occupiedUnits = Math.round(totalUnits * baseOccupancy / 100);
    const occupiedArea = totalArea * baseOccupancy / 100;

    await prisma.occupancySnapshot.create({
      data: {
        mallId: mall.id,
        period,
        snapshotDate,
        totalUnits,
        occupiedUnits,
        vacantUnits: totalUnits - occupiedUnits,
        underFitout: Math.round(Math.random() * 3),
        totalAreaSqm: totalArea,
        occupiedAreaSqm: occupiedArea,
        occupancyRate: baseOccupancy,
        revenuePerSqm: 400000 + Math.random() * 100000,
      },
    });
  }
  console.log('Occupancy snapshots created');

  // ── Wave 6-7: New model seed data ──────────────────────────────────────────

  // UserMallAccess — grant admin and CEO access to all malls
  await prisma.userMallAccess.createMany({
    data: [
      { userId: adminUser.id, mallId: mall.id, role: Role.ADMIN, grantedById: adminUser.id },
      { userId: ceoUser.id, mallId: mall.id, role: Role.CEO, grantedById: adminUser.id },
      { userId: mallDirector.id, mallId: mall.id, role: Role.MALL_DIRECTOR, grantedById: adminUser.id },
    ],
    skipDuplicates: true,
  });
  console.log('UserMallAccess created');

  // MallAnnouncement — sample announcements
  await prisma.mallAnnouncement.createMany({
    data: [
      {
        mallId: mall.id,
        title: 'Bảo trì hệ thống điện tầng B1',
        content: 'Kính thông báo: Hệ thống điện tầng B1 sẽ được bảo trì từ 22h-6h sáng ngày 20/06/2026. Quý khách thuê vui lòng chuẩn bị nguồn điện dự phòng.',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdById: adminUser.id,
      },
      {
        mallId: mall.id,
        title: 'Khai trương khu vực ẩm thực tầng 3',
        content: 'Hân hạnh thông báo khu vực ẩm thực tầng 3 sẽ chính thức khai trương vào ngày 01/07/2026 với nhiều thương hiệu F&B mới.',
        category: 'EVENT',
        priority: 'NORMAL',
        publishedAt: new Date(),
        createdById: adminUser.id,
      },
      {
        mallId: mall.id,
        title: 'Cập nhật chính sách vệ sinh chung',
        content: 'Từ tháng 7/2026, tất cả khách thuê cần thực hiện phân loại rác theo đúng quy định mới của Mall. Chi tiết xem file đính kèm.',
        category: 'POLICY',
        priority: 'NORMAL',
        publishedAt: new Date(),
        createdById: adminUser.id,
      },
    ],
  });
  console.log('MallAnnouncements created');

  // FitoutContractor + WorkerAccessLog for first fitout project (if exists)
  const firstFitout = await prisma.fitoutProject.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firstFitout) {
    const contractor = await prisma.fitoutContractor.create({
      data: {
        projectId: firstFitout.id,
        companyName: 'Công ty Xây dựng ABC',
        licenseNo: 'GXD-2024-001',
        contactName: 'Nguyễn Văn Thầu',
        phone: '0912345678',
        email: 'contact@abc-construction.vn',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-04-30'),
      },
    });

    await prisma.workerAccessLog.createMany({
      data: [
        {
          projectId: firstFitout.id,
          contractorId: contractor.id,
          workerName: 'Trần Văn A',
          idNumber: '001234567890',
          entryDate: new Date('2024-03-01T08:00:00'),
          exitDate: new Date('2024-03-01T17:30:00'),
          purpose: 'Lắp đặt hệ thống điện',
        },
        {
          projectId: firstFitout.id,
          contractorId: contractor.id,
          workerName: 'Lê Văn B',
          idNumber: '001234567891',
          entryDate: new Date('2024-03-01T08:15:00'),
          exitDate: new Date('2024-03-01T17:30:00'),
          purpose: 'Lắp đặt hệ thống điện',
        },
      ],
    });
    console.log('FitoutContractor & WorkerAccessLogs created');
  }

  // ProposalScenario for first proposal (if exists)
  const firstProposal = await prisma.proposal.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firstProposal) {
    await prisma.proposalScenario.createMany({
      data: [
        {
          proposalId: firstProposal.id,
          name: 'Kịch bản A — Cơ sở',
          description: 'Điều khoản tiêu chuẩn không chiết khấu',
          isSelected: true,
          terms: { area: 100, rentPerSqm: 500000, camPerSqm: 50000, term: 24, deposit: 3, rentFree: 0, discount: 0, escalation: 5, monthlyRent: 55000000, depositAmount: 165000000, totalValue: 1320000000 },
          score: 72,
        },
        {
          proposalId: firstProposal.id,
          name: 'Kịch bản B — Ưu đãi',
          description: 'Chiết khấu 10% + 1 tháng miễn phí',
          isSelected: false,
          terms: { area: 100, rentPerSqm: 500000, camPerSqm: 50000, term: 24, deposit: 3, rentFree: 1, discount: 10, escalation: 5, monthlyRent: 49500000, depositAmount: 148500000, totalValue: 1138500000 },
          score: 55,
        },
      ],
    });
    console.log('ProposalScenarios created');
  }

  // SapEntityMapping for sample tenant and invoice
  const firstTenant = await prisma.tenant.findFirst();
  const firstInvoice = await prisma.invoice.findFirst();
  if (firstTenant) {
    await prisma.sapEntityMapping.upsert({
      where: { entityType_entityId: { entityType: 'TENANT', entityId: firstTenant.id } },
      create: { entityType: 'TENANT', entityId: firstTenant.id, sapRef: 'BP-10001', sapSystem: 'S4HANA', sapCompanyCode: '1000', syncStatus: 'SYNCED' },
      update: { sapRef: 'BP-10001', syncStatus: 'SYNCED' },
    });
  }
  if (firstInvoice) {
    await prisma.sapEntityMapping.upsert({
      where: { entityType_entityId: { entityType: 'INVOICE', entityId: firstInvoice.id } },
      create: { entityType: 'INVOICE', entityId: firstInvoice.id, sapRef: 'AR-20001', sapSystem: 'S4HANA', sapCompanyCode: '1000', syncStatus: 'SYNCED' },
      update: { sapRef: 'AR-20001', syncStatus: 'SYNCED' },
    });
  }
  console.log('SapEntityMappings created');

  // LeadFollowUp for first lead
  const firstLead = await prisma.lead.findFirst();
  if (firstLead) {
    await prisma.leadFollowUp.create({
      data: {
        leadId: firstLead.id,
        dueDate: new Date(Date.now() + 3 * 86400000),
        note: 'Gọi điện xác nhận lịch xem mặt bằng',
        assignedToId: leasingExec.id,
      },
    });
    console.log('LeadFollowUp created');
  }

  // MaintenanceSchedule
  await prisma.maintenanceSchedule.create({
    data: {
      mallId: mall.id,
      title: 'Kiểm tra hệ thống PCCC',
      description: 'Kiểm tra và bảo dưỡng hệ thống phòng cháy chữa cháy định kỳ',
      frequency: 'MONTHLY',
      nextDueDate: new Date(Date.now() + 30 * 86400000),
    },
  });
  console.log('MaintenanceSchedule created');

  console.log('Wave 4-5 seed data completed');
  console.log('Seed completed successfully!');
  console.log('');
  console.log('Default credentials:');
  console.log('  Admin: admin@thiso.com / Admin123!');
  console.log('  Executive: executive@thiso.com / User123!');
  console.log('  Manager: manager@thiso.com / User123!');
  console.log('  Director: director@thiso.com / User123!');
  console.log('  Finance: finance@thiso.com / User123!');
  console.log('  Legal: legal@thiso.com / User123!');
  console.log('  Operation: operation@thiso.com / User123!');
  console.log('  CEO: ceo@thiso.com / User123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
