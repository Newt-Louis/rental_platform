--
-- PostgreSQL database cluster dump
--

\restrict DPVbsqOPRep6c9zqBqUDSmLxGDbnDusLtNhj2sXhMowNq0XVJ2K6rsKhQnH7eSH

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Drop databases (except postgres and template1)
--

DROP DATABASE IF EXISTS leasing_platform;




--
-- Drop roles
--

DROP ROLE IF EXISTS leasing;


--
-- Roles
--

CREATE ROLE leasing;
ALTER ROLE leasing WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:eMVIbH06gYa8RIc0RAs9Ng==$jvcFTW3r6yrHvsEX3qLuEWiXsXyj/hicpM4YjV85Wxk=:/SpEvIRKpkPHS4ok35Jnttjm/SePuANUtRA05hmFZhs=';

--
-- User Configurations
--








\unrestrict DPVbsqOPRep6c9zqBqUDSmLxGDbnDusLtNhj2sXhMowNq0XVJ2K6rsKhQnH7eSH

--
-- Databases
--

--
-- Database "template1" dump
--

--
-- PostgreSQL database dump
--

\restrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

UPDATE pg_catalog.pg_database SET datistemplate = false WHERE datname = 'template1';
DROP DATABASE template1;
--
-- Name: template1; Type: DATABASE; Schema: -; Owner: leasing
--

CREATE DATABASE template1 WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE template1 OWNER TO leasing;

\unrestrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt
\connect template1
\restrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE template1; Type: COMMENT; Schema: -; Owner: leasing
--

COMMENT ON DATABASE template1 IS 'default template for new databases';


--
-- Name: template1; Type: DATABASE PROPERTIES; Schema: -; Owner: leasing
--

ALTER DATABASE template1 IS_TEMPLATE = true;


\unrestrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt
\connect template1
\restrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE template1; Type: ACL; Schema: -; Owner: leasing
--

REVOKE CONNECT,TEMPORARY ON DATABASE template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE template1 TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict h2MbTXtYRhHZHjcQ6EQYXGcyFLJNOIMbAqajc7NXSCgj94iMaWB9tijb16Deqjt

--
-- Database "leasing_platform" dump
--

--
-- PostgreSQL database dump
--

\restrict RgrUuCsn6JtTxRvukVan2bmkzgJaFtPsfHu7iVzmZt1vMTW3zTpU7fkHcQuE6H0

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: leasing_platform; Type: DATABASE; Schema: -; Owner: leasing
--

CREATE DATABASE leasing_platform WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE leasing_platform OWNER TO leasing;

\unrestrict RgrUuCsn6JtTxRvukVan2bmkzgJaFtPsfHu7iVzmZt1vMTW3zTpU7fkHcQuE6H0
\connect leasing_platform
\restrict RgrUuCsn6JtTxRvukVan2bmkzgJaFtPsfHu7iVzmZt1vMTW3zTpU7fkHcQuE6H0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ActivityType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."ActivityType" AS ENUM (
    'CALL',
    'EMAIL',
    'MEETING',
    'SITE_VISIT',
    'PROPOSAL_SENT',
    'NOTE',
    'OTHER'
);


ALTER TYPE public."ActivityType" OWNER TO leasing;

--
-- Name: AmendmentStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."AmendmentStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'APPLIED'
);


ALTER TYPE public."AmendmentStatus" OWNER TO leasing;

--
-- Name: AmendmentType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."AmendmentType" AS ENUM (
    'RENT_CHANGE',
    'TERM_EXTENSION',
    'RENT_FREE_CHANGE',
    'CAM_CHANGE',
    'RENEWAL',
    'OTHER'
);


ALTER TYPE public."AmendmentType" OWNER TO leasing;

--
-- Name: BillingCycle; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."BillingCycle" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'ANNUALLY'
);


ALTER TYPE public."BillingCycle" OWNER TO leasing;

--
-- Name: BillingScheduleStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."BillingScheduleStatus" AS ENUM (
    'PENDING',
    'INVOICED',
    'SKIPPED'
);


ALTER TYPE public."BillingScheduleStatus" OWNER TO leasing;

--
-- Name: BookingActivityType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."BookingActivityType" AS ENUM (
    'CREATED',
    'ACTIVATED',
    'PRIORITY_CHANGED',
    'EXTENDED',
    'NOTE_ADDED',
    'CONVERTED',
    'CANCELLED',
    'EXPIRED'
);


ALTER TYPE public."BookingActivityType" OWNER TO leasing;

--
-- Name: BookingStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."BookingStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'EXPIRED',
    'CANCELLED',
    'CONVERTED'
);


ALTER TYPE public."BookingStatus" OWNER TO leasing;

--
-- Name: ContractStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."ContractStatus" AS ENUM (
    'DRAFT',
    'PENDING_LEGAL',
    'PENDING_SIGNATURE',
    'ACTIVE',
    'EXPIRING',
    'EXPIRED',
    'TERMINATED'
);


ALTER TYPE public."ContractStatus" OWNER TO leasing;

--
-- Name: ContractType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."ContractType" AS ENUM (
    'LOI',
    'LEASE_AGREEMENT',
    'APPENDIX',
    'RENEWAL',
    'TERMINATION'
);


ALTER TYPE public."ContractType" OWNER TO leasing;

--
-- Name: CustomerStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."CustomerStatus" AS ENUM (
    'PROSPECT',
    'NEGOTIATING',
    'ACTIVE',
    'INACTIVE',
    'BLACKLISTED'
);


ALTER TYPE public."CustomerStatus" OWNER TO leasing;

--
-- Name: FitoutDocumentStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."FitoutDocumentStatus" AS ENUM (
    'PENDING',
    'SUBMITTED',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."FitoutDocumentStatus" OWNER TO leasing;

--
-- Name: FitoutDocumentType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."FitoutDocumentType" AS ENUM (
    'DESIGN_DRAWING',
    'MEP_DRAWING',
    'FIRE_SAFETY_CERT',
    'PCCC_APPROVAL',
    'CONSTRUCTION_PERMIT',
    'INSURANCE_CERT',
    'INSPECTION_REPORT',
    'HANDOVER_FORM',
    'OTHER'
);


ALTER TYPE public."FitoutDocumentType" OWNER TO leasing;

--
-- Name: FitoutStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."FitoutStatus" AS ENUM (
    'CONTRACT_SIGNED',
    'SUBMIT_DESIGN',
    'DESIGN_REVIEW',
    'FIRE_SAFETY_REVIEW',
    'CONSTRUCTION_PERMIT',
    'FITOUT_IN_PROGRESS',
    'INSPECTION',
    'APPROVED_TO_OPEN',
    'OPENED'
);


ALTER TYPE public."FitoutStatus" OWNER TO leasing;

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'PARTIALLY_PAID',
    'PAID',
    'OVERDUE',
    'CANCELLED'
);


ALTER TYPE public."InvoiceStatus" OWNER TO leasing;

--
-- Name: InvoiceType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."InvoiceType" AS ENUM (
    'MONTHLY_RENT',
    'DEPOSIT',
    'UTILITY',
    'MARKETING_FEE',
    'PARKING',
    'PENALTY',
    'REVENUE_SHARE'
);


ALTER TYPE public."InvoiceType" OWNER TO leasing;

--
-- Name: LeadPriority; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."LeadPriority" AS ENUM (
    'HOT',
    'WARM',
    'COLD'
);


ALTER TYPE public."LeadPriority" OWNER TO leasing;

--
-- Name: LeadSource; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."LeadSource" AS ENUM (
    'BROKER',
    'WEBSITE',
    'REFERRAL',
    'WALK_IN',
    'EXISTING_TENANT'
);


ALTER TYPE public."LeadSource" OWNER TO leasing;

--
-- Name: LeadStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."LeadStatus" AS ENUM (
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL',
    'NEGOTIATION',
    'WON',
    'LOST'
);


ALTER TYPE public."LeadStatus" OWNER TO leasing;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'BANK_TRANSFER',
    'CASH',
    'CHEQUE',
    'ONLINE'
);


ALTER TYPE public."PaymentMethod" OWNER TO leasing;

--
-- Name: PriceApprovalStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."PriceApprovalStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."PriceApprovalStatus" OWNER TO leasing;

--
-- Name: ProposalStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."ProposalStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'CONVERTED'
);


ALTER TYPE public."ProposalStatus" OWNER TO leasing;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'LEASING_EXECUTIVE',
    'LEASING_MANAGER',
    'MALL_DIRECTOR',
    'FINANCE',
    'LEGAL',
    'OPERATION',
    'TENANT',
    'CEO'
);


ALTER TYPE public."Role" OWNER TO leasing;

--
-- Name: SapStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."SapStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'RETRYING'
);


ALTER TYPE public."SapStatus" OWNER TO leasing;

--
-- Name: SlotBookingStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."SlotBookingStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED'
);


ALTER TYPE public."SlotBookingStatus" OWNER TO leasing;

--
-- Name: SlotType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."SlotType" AS ENUM (
    'SHORT_TERM',
    'LONG_TERM',
    'FLEXIBLE'
);


ALTER TYPE public."SlotType" OWNER TO leasing;

--
-- Name: StepStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."StepStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SKIPPED'
);


ALTER TYPE public."StepStatus" OWNER TO leasing;

--
-- Name: TicketPriority; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."TicketPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


ALTER TYPE public."TicketPriority" OWNER TO leasing;

--
-- Name: TicketStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."TicketStatus" AS ENUM (
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_TENANT',
    'RESOLVED',
    'CLOSED'
);


ALTER TYPE public."TicketStatus" OWNER TO leasing;

--
-- Name: TicketType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."TicketType" AS ENUM (
    'ELECTRICAL',
    'WATER',
    'HVAC',
    'CLEANING',
    'SECURITY',
    'PARKING',
    'INTERNET',
    'DELIVERY',
    'MARKETING_EVENT',
    'OTHER'
);


ALTER TYPE public."TicketType" OWNER TO leasing;

--
-- Name: UnitHistoryType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."UnitHistoryType" AS ENUM (
    'STATUS_CHANGE',
    'RENT_CHANGE',
    'TENANT_CHANGE',
    'INFO_UPDATE',
    'CONDITION_CHANGE'
);


ALTER TYPE public."UnitHistoryType" OWNER TO leasing;

--
-- Name: UnitMediaType; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."UnitMediaType" AS ENUM (
    'PHOTO',
    'FLOOR_PLAN',
    'VIDEO',
    'RENDER_3D',
    'BROCHURE',
    'SITE_MAP'
);


ALTER TYPE public."UnitMediaType" OWNER TO leasing;

--
-- Name: UnitStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."UnitStatus" AS ENUM (
    'VACANT',
    'BOOKING',
    'NEGOTIATING',
    'CONTRACTED',
    'UNDER_FITOUT',
    'OCCUPIED'
);


ALTER TYPE public."UnitStatus" OWNER TO leasing;

--
-- Name: WorkflowStatus; Type: TYPE; Schema: public; Owner: leasing
--

CREATE TYPE public."WorkflowStatus" AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."WorkflowStatus" OWNER TO leasing;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ApprovalPolicyRule; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ApprovalPolicyRule" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "stepName" text NOT NULL,
    "stepOrder" integer NOT NULL,
    "approverRole" public."Role" NOT NULL,
    "conditionType" text NOT NULL,
    operator text,
    threshold double precision,
    "matchValue" text,
    "isRequired" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ApprovalPolicyRule" OWNER TO leasing;

--
-- Name: ApprovalStep; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ApprovalStep" (
    id text NOT NULL,
    "workflowId" text NOT NULL,
    "stepOrder" integer NOT NULL,
    "stepName" text NOT NULL,
    "approverRole" public."Role" NOT NULL,
    "approverId" text,
    status public."StepStatus" DEFAULT 'PENDING'::public."StepStatus" NOT NULL,
    comment text,
    "decidedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ApprovalStep" OWNER TO leasing;

--
-- Name: ApprovalWorkflow; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ApprovalWorkflow" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "proposalId" text,
    status public."WorkflowStatus" DEFAULT 'PENDING'::public."WorkflowStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ApprovalWorkflow" OWNER TO leasing;

--
-- Name: ArDunningLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ArDunningLog" (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    "policyId" text NOT NULL,
    level integer NOT NULL,
    "sentAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ArDunningLog" OWNER TO leasing;

--
-- Name: ArDunningPolicy; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ArDunningPolicy" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    level integer NOT NULL,
    "minDaysOverdue" integer NOT NULL,
    "maxDaysOverdue" integer,
    "notifyTenant" boolean DEFAULT true NOT NULL,
    "notifyFinance" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ArDunningPolicy" OWNER TO leasing;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    endpoint text,
    payload text,
    "oldValue" text,
    "newValue" text,
    "ipAddress" text,
    "userAgent" text,
    duration integer,
    status text DEFAULT 'SUCCESS'::text NOT NULL,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO leasing;

--
-- Name: BankStatement; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."BankStatement" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "bankAccount" text NOT NULL,
    "bankName" text,
    "statementDate" timestamp(3) without time zone NOT NULL,
    "openingBalance" double precision DEFAULT 0 NOT NULL,
    "closingBalance" double precision DEFAULT 0 NOT NULL,
    transactions jsonb NOT NULL,
    "importedById" text NOT NULL,
    "importedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reconciledCount" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."BankStatement" OWNER TO leasing;

--
-- Name: BillingConfig; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."BillingConfig" (
    id text NOT NULL,
    "autoIssueInvoices" boolean DEFAULT false NOT NULL,
    "notifyTenantOnIssue" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BillingConfig" OWNER TO leasing;

--
-- Name: BillingScheduleEntry; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."BillingScheduleEntry" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    period text NOT NULL,
    "periodStart" timestamp(3) without time zone NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    "rentAmount" double precision NOT NULL,
    "camAmount" double precision NOT NULL,
    subtotal double precision NOT NULL,
    "dueDate" timestamp(3) without time zone NOT NULL,
    status public."BillingScheduleStatus" DEFAULT 'PENDING'::public."BillingScheduleStatus" NOT NULL,
    "invoiceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BillingScheduleEntry" OWNER TO leasing;

--
-- Name: BookingActivity; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."BookingActivity" (
    id text NOT NULL,
    "bookingId" text NOT NULL,
    type public."BookingActivityType" NOT NULL,
    note text NOT NULL,
    metadata jsonb,
    "performedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."BookingActivity" OWNER TO leasing;

--
-- Name: Building; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Building" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Building" OWNER TO leasing;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    "parentId" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Category" OWNER TO leasing;

--
-- Name: CategoryMallPricing; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."CategoryMallPricing" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "categoryId" text NOT NULL,
    "floorId" text,
    "zoneId" text,
    "minRentPerSqm" double precision NOT NULL,
    "maxRentPerSqm" double precision NOT NULL,
    "suggestedRent" double precision,
    "camPerSqm" double precision DEFAULT 0 NOT NULL,
    "effectiveFrom" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "effectiveTo" timestamp(3) without time zone,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdById" text
);


ALTER TABLE public."CategoryMallPricing" OWNER TO leasing;

--
-- Name: ComplianceExport; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ComplianceExport" (
    id text NOT NULL,
    "exportType" text NOT NULL,
    "mallId" text,
    "periodStart" timestamp(3) without time zone NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    "filePath" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "requestedBy" text NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ComplianceExport" OWNER TO leasing;

--
-- Name: Contract; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Contract" (
    id text NOT NULL,
    "contractNumber" text NOT NULL,
    "proposalId" text,
    "tenantId" text NOT NULL,
    "unitId" text NOT NULL,
    type public."ContractType" DEFAULT 'LEASE_AGREEMENT'::public."ContractType" NOT NULL,
    status public."ContractStatus" DEFAULT 'DRAFT'::public."ContractStatus" NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    term integer NOT NULL,
    rent double precision NOT NULL,
    cam double precision DEFAULT 0 NOT NULL,
    deposit double precision NOT NULL,
    "billingCycle" public."BillingCycle" DEFAULT 'MONTHLY'::public."BillingCycle" NOT NULL,
    "paymentTerm" integer DEFAULT 30 NOT NULL,
    "rentFree" integer DEFAULT 0 NOT NULL,
    "escalationPercent" double precision DEFAULT 0 NOT NULL,
    "managedById" text,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "templateId" text
);


ALTER TABLE public."Contract" OWNER TO leasing;

--
-- Name: ContractAmendment; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractAmendment" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "amendmentNumber" text NOT NULL,
    type public."AmendmentType" NOT NULL,
    status public."AmendmentStatus" DEFAULT 'DRAFT'::public."AmendmentStatus" NOT NULL,
    "effectiveDate" timestamp(3) without time zone NOT NULL,
    changes jsonb NOT NULL,
    reason text,
    "submittedAt" timestamp(3) without time zone,
    "approvedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ContractAmendment" OWNER TO leasing;

--
-- Name: ContractClause; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractClause" (
    id text NOT NULL,
    "templateId" text NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "isRequired" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ContractClause" OWNER TO leasing;

--
-- Name: ContractEvent; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractEvent" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "eventType" text NOT NULL,
    title text NOT NULL,
    description text,
    "beforeValue" text,
    "afterValue" text,
    "userId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ContractEvent" OWNER TO leasing;

--
-- Name: ContractFile; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractFile" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "fileName" text NOT NULL,
    "filePath" text NOT NULL,
    "fileType" text,
    "fileSize" integer,
    "uploadedById" text,
    "sha256Hash" text,
    "signedAt" timestamp(3) without time zone,
    "signerName" text,
    "signerRole" text,
    "verifyCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ContractFile" OWNER TO leasing;

--
-- Name: ContractTemplate; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractTemplate" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "contractType" public."ContractType" DEFAULT 'LEASE_AGREEMENT'::public."ContractType" NOT NULL,
    content text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ContractTemplate" OWNER TO leasing;

--
-- Name: ContractTermination; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ContractTermination" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "initiatedBy" text NOT NULL,
    reason text NOT NULL,
    "effectiveDate" timestamp(3) without time zone NOT NULL,
    "noticePeriodDays" integer DEFAULT 60 NOT NULL,
    "depositRefund" double precision,
    "penaltyAmount" double precision,
    "handoverDate" timestamp(3) without time zone,
    "handoverCondition" text,
    "utilityFinalRead" jsonb,
    "accessCardReturn" boolean DEFAULT false NOT NULL,
    "signageRemoved" boolean DEFAULT false NOT NULL,
    "keysReturned" boolean DEFAULT false NOT NULL,
    status text DEFAULT 'INITIATED'::text NOT NULL,
    "completedAt" timestamp(3) without time zone,
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ContractTermination" OWNER TO leasing;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    "customerCode" text NOT NULL,
    "companyName" text NOT NULL,
    "brandName" text,
    "taxCode" text,
    industry text,
    "contactName" text NOT NULL,
    "contactTitle" text,
    phone text,
    email text,
    address text,
    website text,
    source public."LeadSource" DEFAULT 'WALK_IN'::public."LeadSource" NOT NULL,
    status public."CustomerStatus" DEFAULT 'PROSPECT'::public."CustomerStatus" NOT NULL,
    "preferredCategory" text,
    "preferredCategoryId" text,
    "expectedArea" double precision,
    "budgetMin" double precision,
    "budgetMax" double precision,
    rating integer DEFAULT 3,
    "assignedToId" text,
    "tenantId" text,
    "createdById" text,
    notes text,
    "wonAt" timestamp(3) without time zone,
    "lostAt" timestamp(3) without time zone,
    "lostReason" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Customer" OWNER TO leasing;

--
-- Name: CustomerActivity; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."CustomerActivity" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    type public."ActivityType" NOT NULL,
    subject text,
    note text NOT NULL,
    "scheduledAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    outcome text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CustomerActivity" OWNER TO leasing;

--
-- Name: DealScoreCriterion; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."DealScoreCriterion" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "fieldSource" text NOT NULL,
    weight double precision DEFAULT 1 NOT NULL,
    "minScore" double precision DEFAULT 0 NOT NULL,
    "maxScore" double precision DEFAULT 100 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."DealScoreCriterion" OWNER TO leasing;

--
-- Name: DepositAccount; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."DepositAccount" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "tenantId" text NOT NULL,
    "depositAmount" double precision NOT NULL,
    "receivedAmount" double precision DEFAULT 0 NOT NULL,
    "bankAccount" text,
    "receivedDate" timestamp(3) without time zone,
    "refundDate" timestamp(3) without time zone,
    "refundAmount" double precision,
    deductions jsonb,
    status text DEFAULT 'PENDING'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."DepositAccount" OWNER TO leasing;

--
-- Name: DocumentDownloadLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."DocumentDownloadLog" (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "userId" text NOT NULL,
    "downloadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ipAddress" text,
    purpose text
);


ALTER TABLE public."DocumentDownloadLog" OWNER TO leasing;

--
-- Name: FitoutChecklist; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutChecklist" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    title text NOT NULL,
    description text,
    "isCompleted" boolean DEFAULT false NOT NULL,
    "completedById" text,
    "completedAt" timestamp(3) without time zone,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."FitoutChecklist" OWNER TO leasing;

--
-- Name: FitoutContractor; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutContractor" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "companyName" text NOT NULL,
    "licenseNo" text,
    "contactName" text NOT NULL,
    phone text NOT NULL,
    email text,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."FitoutContractor" OWNER TO leasing;

--
-- Name: FitoutDocument; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutDocument" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "documentType" public."FitoutDocumentType" NOT NULL,
    "fileName" text NOT NULL,
    "filePath" text NOT NULL,
    "fileSizeKb" integer DEFAULT 0 NOT NULL,
    status public."FitoutDocumentStatus" DEFAULT 'PENDING'::public."FitoutDocumentStatus" NOT NULL,
    "requiredFor" public."FitoutStatus",
    "uploadedById" text,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    "reviewNote" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."FitoutDocument" OWNER TO leasing;

--
-- Name: FitoutDocumentGate; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutDocumentGate" (
    id text NOT NULL,
    stage public."FitoutStatus" NOT NULL,
    "documentType" public."FitoutDocumentType" NOT NULL,
    "isRequired" boolean DEFAULT true NOT NULL,
    description text,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."FitoutDocumentGate" OWNER TO leasing;

--
-- Name: FitoutMilestone; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutMilestone" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    stage public."FitoutStatus" NOT NULL,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "targetDate" timestamp(3) without time zone,
    "slaDays" integer,
    "isOverdue" boolean DEFAULT false NOT NULL,
    "escalatedAt" timestamp(3) without time zone,
    notes text
);


ALTER TABLE public."FitoutMilestone" OWNER TO leasing;

--
-- Name: FitoutProject; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutProject" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "tenantId" text NOT NULL,
    "unitId" text NOT NULL,
    status public."FitoutStatus" DEFAULT 'CONTRACT_SIGNED'::public."FitoutStatus" NOT NULL,
    "handoverDate" timestamp(3) without time zone,
    "startDate" timestamp(3) without time zone,
    "expectedOpenDate" timestamp(3) without time zone,
    "actualOpenDate" timestamp(3) without time zone,
    "operationManagerId" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."FitoutProject" OWNER TO leasing;

--
-- Name: FitoutSlaPolicy; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FitoutSlaPolicy" (
    id text NOT NULL,
    stage public."FitoutStatus" NOT NULL,
    "targetDays" integer NOT NULL,
    "warningDays" integer NOT NULL,
    "escalateToRole" public."Role",
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."FitoutSlaPolicy" OWNER TO leasing;

--
-- Name: Floor; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Floor" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "buildingId" text,
    name text NOT NULL,
    level text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "floorPlanUrl" text,
    "floorPlanRatio" double precision
);


ALTER TABLE public."Floor" OWNER TO leasing;

--
-- Name: FloorPlanAnalysis; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."FloorPlanAnalysis" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "fileName" text NOT NULL,
    "filePath" text NOT NULL,
    "fileType" text DEFAULT 'pdf'::text NOT NULL,
    "fileSizeKb" integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    analysis jsonb,
    suggestions jsonb,
    "appliedAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."FloorPlanAnalysis" OWNER TO leasing;

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "invoiceNumber" text NOT NULL,
    "contractId" text NOT NULL,
    "tenantId" text NOT NULL,
    period text NOT NULL,
    type public."InvoiceType" DEFAULT 'MONTHLY_RENT'::public."InvoiceType" NOT NULL,
    status public."InvoiceStatus" DEFAULT 'DRAFT'::public."InvoiceStatus" NOT NULL,
    subtotal double precision NOT NULL,
    "vatRate" double precision DEFAULT 10 NOT NULL,
    "vatAmount" double precision NOT NULL,
    "totalAmount" double precision NOT NULL,
    "dueDate" timestamp(3) without time zone NOT NULL,
    "issuedAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Invoice" OWNER TO leasing;

--
-- Name: InvoiceLine; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."InvoiceLine" (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    qty double precision DEFAULT 1 NOT NULL,
    "unitPrice" double precision NOT NULL,
    amount double precision NOT NULL,
    "order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."InvoiceLine" OWNER TO leasing;

--
-- Name: Lead; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Lead" (
    id text NOT NULL,
    "brandName" text NOT NULL,
    company text,
    "contactName" text NOT NULL,
    phone text,
    email text,
    category text,
    "categoryId" text,
    source public."LeadSource" DEFAULT 'WALK_IN'::public."LeadSource" NOT NULL,
    status public."LeadStatus" DEFAULT 'NEW'::public."LeadStatus" NOT NULL,
    priority public."LeadPriority" DEFAULT 'WARM'::public."LeadPriority" NOT NULL,
    "assignedToId" text,
    "tenantId" text,
    "customerId" text,
    notes text,
    "expectedRent" double precision,
    "expectedArea" double precision,
    "estimatedValue" double precision,
    "expectedCloseDate" timestamp(3) without time zone,
    "preferredCategory" text,
    "position" integer DEFAULT 0 NOT NULL,
    "lastActivityAt" timestamp(3) without time zone,
    "lostReason" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Lead" OWNER TO leasing;

--
-- Name: LeadActivity; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."LeadActivity" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    type text NOT NULL,
    note text NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LeadActivity" OWNER TO leasing;

--
-- Name: LeadContact; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."LeadContact" (
    id text NOT NULL,
    "leadId" text NOT NULL,
    name text NOT NULL,
    title text,
    email text,
    phone text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LeadContact" OWNER TO leasing;

--
-- Name: LeadFollowUp; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."LeadFollowUp" (
    id text NOT NULL,
    "leadId" text,
    "customerId" text,
    "assignedToId" text NOT NULL,
    "dueDate" timestamp(3) without time zone NOT NULL,
    note text,
    "isDone" boolean DEFAULT false NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."LeadFollowUp" OWNER TO leasing;

--
-- Name: MaintenanceSchedule; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."MaintenanceSchedule" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "unitId" text,
    title text NOT NULL,
    description text,
    frequency text NOT NULL,
    "nextDueDate" timestamp(3) without time zone NOT NULL,
    "lastExecutedAt" timestamp(3) without time zone,
    "assignedRole" public."Role" DEFAULT 'OPERATION'::public."Role" NOT NULL,
    "estimatedHours" double precision,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MaintenanceSchedule" OWNER TO leasing;

--
-- Name: Mall; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Mall" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    address text,
    city text,
    "totalArea" double precision,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Mall" OWNER TO leasing;

--
-- Name: MallAnnouncement; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."MallAnnouncement" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text NOT NULL,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    "publishedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "targetAll" boolean DEFAULT true NOT NULL,
    "targetCategories" text[],
    "attachmentUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MallAnnouncement" OWNER TO leasing;

--
-- Name: MallPolicy; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."MallPolicy" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    policies jsonb NOT NULL,
    "kpiTargets" jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MallPolicy" OWNER TO leasing;

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text,
    "tenantId" text,
    title text NOT NULL,
    body text NOT NULL,
    type text NOT NULL,
    "entityType" text,
    "entityId" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Notification" OWNER TO leasing;

--
-- Name: OccupancySnapshot; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."OccupancySnapshot" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "floorId" text,
    category text,
    period text NOT NULL,
    "snapshotDate" timestamp(3) without time zone NOT NULL,
    "totalUnits" integer NOT NULL,
    "occupiedUnits" integer NOT NULL,
    "vacantUnits" integer NOT NULL,
    "underFitout" integer DEFAULT 0 NOT NULL,
    "totalAreaSqm" double precision NOT NULL,
    "occupiedAreaSqm" double precision NOT NULL,
    "occupancyRate" double precision NOT NULL,
    "revenuePerSqm" double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."OccupancySnapshot" OWNER TO leasing;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    "tenantId" text NOT NULL,
    amount double precision NOT NULL,
    method public."PaymentMethod" DEFAULT 'BANK_TRANSFER'::public."PaymentMethod" NOT NULL,
    reference text,
    "paidAt" timestamp(3) without time zone NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Payment" OWNER TO leasing;

--
-- Name: PaymentReconciliation; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."PaymentReconciliation" (
    id text NOT NULL,
    "paymentId" text NOT NULL,
    "bankStatementId" text NOT NULL,
    "bankRef" text NOT NULL,
    "bankAmount" double precision NOT NULL,
    variance double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'MATCHED'::text NOT NULL,
    "reconciledById" text,
    "reconciledAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PaymentReconciliation" OWNER TO leasing;

--
-- Name: PenaltyInterestPolicy; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."PenaltyInterestPolicy" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "annualRate" double precision DEFAULT 12 NOT NULL,
    "graceDays" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PenaltyInterestPolicy" OWNER TO leasing;

--
-- Name: Proposal; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Proposal" (
    id text NOT NULL,
    "proposalNumber" text NOT NULL,
    "leadId" text,
    "tenantId" text,
    "unitId" text NOT NULL,
    area double precision NOT NULL,
    term integer NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "rentPerSqm" double precision NOT NULL,
    "camPerSqm" double precision DEFAULT 0 NOT NULL,
    deposit double precision DEFAULT 3 NOT NULL,
    "rentFree" integer DEFAULT 0 NOT NULL,
    "escalationPercent" double precision DEFAULT 0 NOT NULL,
    "revenueSharePercent" double precision DEFAULT 0 NOT NULL,
    "marketingFee" double precision DEFAULT 0 NOT NULL,
    "monthlyRent" double precision NOT NULL,
    "monthlyCAM" double precision NOT NULL,
    "depositAmount" double precision NOT NULL,
    "totalContractValue" double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    status public."ProposalStatus" DEFAULT 'DRAFT'::public."ProposalStatus" NOT NULL,
    notes text,
    "businessModel" text,
    "serviceFeeSqm" double precision DEFAULT 0 NOT NULL,
    "businessSupportFeeSqm" double precision DEFAULT 0 NOT NULL,
    "rentCurrency" text DEFAULT 'VND'::text NOT NULL,
    "fitoutDays" integer DEFAULT 90 NOT NULL,
    "handoverDate" timestamp(3) without time zone,
    "openingDate" timestamp(3) without time zone,
    "specialConditions" text,
    "editorContent" jsonb,
    "createdById" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "bookingId" text
);


ALTER TABLE public."Proposal" OWNER TO leasing;

--
-- Name: ProposalDealScore; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ProposalDealScore" (
    id text NOT NULL,
    "proposalId" text NOT NULL,
    "totalScore" double precision NOT NULL,
    grade text NOT NULL,
    breakdown jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ProposalDealScore" OWNER TO leasing;

--
-- Name: ProposalNegotiationRound; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ProposalNegotiationRound" (
    id text NOT NULL,
    "proposalId" text NOT NULL,
    "roundNumber" integer NOT NULL,
    "offeredBy" text NOT NULL,
    "rentPerSqm" double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    "rentFree" integer DEFAULT 0 NOT NULL,
    "camPerSqm" double precision,
    note text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ProposalNegotiationRound" OWNER TO leasing;

--
-- Name: ProposalScenario; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ProposalScenario" (
    id text NOT NULL,
    "proposalId" text NOT NULL,
    name text NOT NULL,
    description text,
    "isSelected" boolean DEFAULT false NOT NULL,
    terms jsonb NOT NULL,
    score double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ProposalScenario" OWNER TO leasing;

--
-- Name: ProposalVersion; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."ProposalVersion" (
    id text NOT NULL,
    "proposalId" text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    "changeReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ProposalVersion" OWNER TO leasing;

--
-- Name: RenewalRiskScore; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."RenewalRiskScore" (
    id text NOT NULL,
    "contractId" text NOT NULL,
    "riskScore" double precision NOT NULL,
    "riskLevel" text NOT NULL,
    factors jsonb NOT NULL,
    "daysToExpiry" integer NOT NULL,
    "calculatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    recommendation text
);


ALTER TABLE public."RenewalRiskScore" OWNER TO leasing;

--
-- Name: SalesAuditTrail; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SalesAuditTrail" (
    id text NOT NULL,
    "salesId" text NOT NULL,
    action text NOT NULL,
    "oldValue" double precision,
    "newValue" double precision NOT NULL,
    reason text,
    "performedById" text NOT NULL,
    "performedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SalesAuditTrail" OWNER TO leasing;

--
-- Name: SalesTurnover; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SalesTurnover" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "unitId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    period text NOT NULL,
    "grossSales" double precision NOT NULL,
    "netSales" double precision NOT NULL,
    transactions integer DEFAULT 0 NOT NULL,
    "recordedById" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SalesTurnover" OWNER TO leasing;

--
-- Name: SapEntityMapping; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SapEntityMapping" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "sapRef" text NOT NULL,
    "sapSystem" text DEFAULT 'S4HANA'::text NOT NULL,
    "sapCompanyCode" text DEFAULT '1000'::text NOT NULL,
    "lastSyncAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "syncStatus" text DEFAULT 'SYNCED'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SapEntityMapping" OWNER TO leasing;

--
-- Name: SapIntegrationLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SapIntegrationLog" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    endpoint text NOT NULL,
    payload text NOT NULL,
    response text,
    status public."SapStatus" DEFAULT 'PENDING'::public."SapStatus" NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "errorMessage" text,
    "idempotencyKey" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SapIntegrationLog" OWNER TO leasing;

--
-- Name: SapReconciliationRecord; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SapReconciliationRecord" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "sapRef" text,
    "ourAmount" double precision NOT NULL,
    "sapAmount" double precision,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "idempotencyKey" text NOT NULL,
    notes text,
    "reconciledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SapReconciliationRecord" OWNER TO leasing;

--
-- Name: SlotBooking; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SlotBooking" (
    id text NOT NULL,
    "bookingRef" text NOT NULL,
    "slotId" text NOT NULL,
    "leadId" text,
    "customerId" text,
    type text NOT NULL,
    "startDatetime" timestamp(3) without time zone NOT NULL,
    "endDatetime" timestamp(3) without time zone NOT NULL,
    "totalArea" double precision,
    "baseAmount" double precision,
    "discountPct" double precision DEFAULT 0,
    "totalAmount" double precision NOT NULL,
    status public."SlotBookingStatus" DEFAULT 'PENDING'::public."SlotBookingStatus" NOT NULL,
    notes text,
    "cancelReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SlotBooking" OWNER TO leasing;

--
-- Name: SlotPricingRule; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."SlotPricingRule" (
    id text NOT NULL,
    "slotId" text NOT NULL,
    name text NOT NULL,
    "ruleType" text NOT NULL,
    multiplier double precision DEFAULT 1,
    "discountPct" double precision DEFAULT 0,
    "minDays" integer,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SlotPricingRule" OWNER TO leasing;

--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Tenant" (
    id text NOT NULL,
    "companyName" text NOT NULL,
    "brandName" text NOT NULL,
    "taxCode" text,
    "contactName" text,
    "contactEmail" text,
    "contactPhone" text,
    address text,
    category text,
    "categoryId" text,
    logo text,
    "isPortalUser" boolean DEFAULT false NOT NULL,
    "portalEmail" text,
    "portalPassword" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Tenant" OWNER TO leasing;

--
-- Name: Ticket; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Ticket" (
    id text NOT NULL,
    "ticketNumber" text NOT NULL,
    "tenantId" text NOT NULL,
    "unitId" text NOT NULL,
    type public."TicketType" NOT NULL,
    priority public."TicketPriority" DEFAULT 'MEDIUM'::public."TicketPriority" NOT NULL,
    sla integer,
    "slaDueAt" timestamp(3) without time zone,
    subject text NOT NULL,
    description text,
    "assignedToId" text,
    status public."TicketStatus" DEFAULT 'NEW'::public."TicketStatus" NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "closedAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Ticket" OWNER TO leasing;

--
-- Name: TicketComment; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."TicketComment" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    "userId" text NOT NULL,
    content text NOT NULL,
    "isInternal" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TicketComment" OWNER TO leasing;

--
-- Name: TicketEscalation; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."TicketEscalation" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    level integer NOT NULL,
    reason text NOT NULL,
    "escalatedTo" text,
    "notifiedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TicketEscalation" OWNER TO leasing;

--
-- Name: TicketFile; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."TicketFile" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    "filePath" text NOT NULL,
    "fileName" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TicketFile" OWNER TO leasing;

--
-- Name: TicketRating; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."TicketRating" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    rating integer NOT NULL,
    comment text,
    "ratedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TicketRating" OWNER TO leasing;

--
-- Name: TicketSlaPolicy; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."TicketSlaPolicy" (
    id text NOT NULL,
    "ticketType" public."TicketType" NOT NULL,
    priority public."TicketPriority" NOT NULL,
    "responseHours" integer NOT NULL,
    "resolutionHours" integer NOT NULL,
    "escalateToRole" public."Role",
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."TicketSlaPolicy" OWNER TO leasing;

--
-- Name: UnifiedDocument; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnifiedDocument" (
    id text NOT NULL,
    "mallId" text,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    category text DEFAULT 'GENERAL'::text NOT NULL,
    "documentType" text NOT NULL,
    "fileName" text NOT NULL,
    "filePath" text NOT NULL,
    "fileHash" text,
    "fileSize" integer DEFAULT 0 NOT NULL,
    "mimeType" text DEFAULT 'application/octet-stream'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "isLatest" boolean DEFAULT true NOT NULL,
    "retentionYear" integer DEFAULT 10 NOT NULL,
    "deleteAfter" timestamp(3) without time zone,
    "signedAt" timestamp(3) without time zone,
    "signedBy" text,
    "uploadedById" text NOT NULL,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "downloadCount" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."UnifiedDocument" OWNER TO leasing;

--
-- Name: Unit; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Unit" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "buildingId" text,
    "floorId" text,
    "zoneId" text,
    code text NOT NULL,
    name text,
    "areaGFA" double precision NOT NULL,
    "areaNLA" double precision NOT NULL,
    category text,
    "categoryId" text,
    "baseRentPerSqm" double precision DEFAULT 0 NOT NULL,
    "camPerSqm" double precision DEFAULT 0 NOT NULL,
    status public."UnitStatus" DEFAULT 'VACANT'::public."UnitStatus" NOT NULL,
    "tenantId" text,
    "leaseStartDate" timestamp(3) without time zone,
    "leaseEndDate" timestamp(3) without time zone,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "marketRentPerSqm" double precision,
    "askingRentPerSqm" double precision,
    "escalationRate" double precision,
    "minLeaseTerm" integer,
    "maxLeaseTerm" integer,
    "vacantSince" timestamp(3) without time zone,
    "lastRenovation" timestamp(3) without time zone,
    condition text,
    features jsonb,
    "virtualTourUrl" text,
    "mapPosX" double precision,
    "mapPosY" double precision,
    "mapPosW" double precision,
    "mapPosH" double precision,
    "mapPolygon" jsonb
);


ALTER TABLE public."Unit" OWNER TO leasing;

--
-- Name: UnitBooking; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnitBooking" (
    id text NOT NULL,
    "bookingNumber" text NOT NULL,
    "unitId" text NOT NULL,
    "leadId" text,
    "customerId" text,
    status public."BookingStatus" DEFAULT 'PENDING'::public."BookingStatus" NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    "requestedArea" double precision,
    "requestedTerm" integer,
    "expectedRent" double precision,
    "holdDays" integer DEFAULT 30 NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "activatedAt" timestamp(3) without time zone,
    "convertedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "cancelReason" text,
    notes text,
    "proposedRentPerSqm" double precision,
    "proposedCamPerSqm" double precision,
    "priceApprovalStatus" public."PriceApprovalStatus",
    "priceApprovalNote" text,
    "priceApprovedById" text,
    "priceApprovedAt" timestamp(3) without time zone,
    "priceDeviationPercent" double precision,
    "createdById" text NOT NULL,
    "assignedToId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UnitBooking" OWNER TO leasing;

--
-- Name: UnitHistory; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnitHistory" (
    id text NOT NULL,
    "unitId" text NOT NULL,
    "changeType" public."UnitHistoryType" NOT NULL,
    "fieldName" text,
    "oldValue" jsonb,
    "newValue" jsonb,
    "changedById" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UnitHistory" OWNER TO leasing;

--
-- Name: UnitImportLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnitImportLog" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "fileName" text NOT NULL,
    "totalRows" integer DEFAULT 0 NOT NULL,
    "successRows" integer DEFAULT 0 NOT NULL,
    "failedRows" integer DEFAULT 0 NOT NULL,
    errors jsonb,
    status text DEFAULT 'PROCESSING'::text NOT NULL,
    "importedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);


ALTER TABLE public."UnitImportLog" OWNER TO leasing;

--
-- Name: UnitMedia; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnitMedia" (
    id text NOT NULL,
    "unitId" text NOT NULL,
    type public."UnitMediaType" DEFAULT 'PHOTO'::public."UnitMediaType" NOT NULL,
    "fileUrl" text NOT NULL,
    "fileName" text NOT NULL,
    "fileSize" integer,
    "mimeType" text,
    caption text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isCover" boolean DEFAULT false NOT NULL,
    "uploadedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UnitMedia" OWNER TO leasing;

--
-- Name: UnitSlot; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UnitSlot" (
    id text NOT NULL,
    "unitId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    area double precision NOT NULL,
    description text,
    "slotType" public."SlotType" DEFAULT 'FLEXIBLE'::public."SlotType",
    "pricePerDaySqm" double precision,
    "pricePerHour" double precision,
    "pricePerSqmMonth" double precision,
    "posX" double precision DEFAULT 10,
    "posY" double precision DEFAULT 10,
    "posW" double precision DEFAULT 20,
    "posH" double precision DEFAULT 20,
    "fillColor" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UnitSlot" OWNER TO leasing;

--
-- Name: User; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    "fullName" text NOT NULL,
    role public."Role" DEFAULT 'LEASING_EXECUTIVE'::public."Role" NOT NULL,
    phone text,
    avatar text,
    department text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO leasing;

--
-- Name: UserMallAccess; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."UserMallAccess" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "mallId" text NOT NULL,
    role public."Role" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "grantedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UserMallAccess" OWNER TO leasing;

--
-- Name: WorkerAccessLog; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."WorkerAccessLog" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "contractorId" text NOT NULL,
    "workerName" text NOT NULL,
    "idNumber" text NOT NULL,
    "entryDate" timestamp(3) without time zone NOT NULL,
    "exitDate" timestamp(3) without time zone,
    purpose text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."WorkerAccessLog" OWNER TO leasing;

--
-- Name: Zone; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public."Zone" (
    id text NOT NULL,
    "mallId" text NOT NULL,
    "buildingId" text,
    "floorId" text,
    name text NOT NULL,
    code text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Zone" OWNER TO leasing;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: leasing
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO leasing;

--
-- Data for Name: ApprovalPolicyRule; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ApprovalPolicyRule" (id, code, name, "stepName", "stepOrder", "approverRole", "conditionType", operator, threshold, "matchValue", "isRequired", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt987vr0009wkh54y2riulz	BASE_LEASING_MANAGER	Base Leasing Manager Approval	Leasing Manager Approval	10	LEASING_MANAGER	DISCOUNT_PCT	>=	0	\N	t	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000awkh58la56aev	MALL_DIRECTOR_HIGH_DISCOUNT	Mall Director on discount > 5%	Mall Director Approval	20	MALL_DIRECTOR	DISCOUNT_PCT	>	5	\N	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000bwkh5tytx7nxp	CEO_VERY_HIGH_DISCOUNT	CEO on discount > 10%	CEO Approval	30	CEO	DISCOUNT_PCT	>	10	\N	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000cwkh55zpsgjmn	MALL_DIRECTOR_LONG_RENT_FREE	Mall Director on rent free > 60 days	Mall Director Approval	40	MALL_DIRECTOR	RENT_FREE_DAYS	>	60	\N	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000dwkh5igm73614	FINANCE_REQUIRED	Finance Review Mandatory	Finance Review	50	FINANCE	DISCOUNT_PCT	>=	0	\N	t	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000ewkh5im5fiqgm	LEGAL_REQUIRED	Legal Review Mandatory	Legal Review	60	LEGAL	DISCOUNT_PCT	>=	0	\N	t	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000fwkh5u0sfkqbe	FINANCE_AR_DEBT	Finance Review if tenant has overdue AR	Finance Risk Review	55	FINANCE	HAS_AR_DEBT	\N	\N	\N	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000gwkh5eskdz5rc	PRICE_BELOW_MIN_5	Giá thấp hơn sàn 0-5%	Leasing Manager Price Review	15	LEASING_MANAGER	PRICE_DEVIATION_PCT	BETWEEN	0	5	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000hwkh5w88o3d4y	PRICE_BELOW_MIN_10	Giá thấp hơn sàn 5-10%	Mall Director Price Review	25	MALL_DIRECTOR	PRICE_DEVIATION_PCT	BETWEEN	5	10	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
cmqt987vr000iwkh56hhhomp5	PRICE_BELOW_MIN_OVER_10	Giá thấp hơn sàn >10%	CEO Price Review	35	CEO	PRICE_DEVIATION_PCT	>	10	\N	f	t	2026-06-25 08:42:49.959	2026-06-25 08:42:49.959
\.


--
-- Data for Name: ApprovalStep; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ApprovalStep" (id, "workflowId", "stepOrder", "stepName", "approverRole", "approverId", status, comment, "decidedAt", "createdAt", "updatedAt") FROM stdin;
cmqt98njx00qtwkh5nplow40i	cmqt98nii00qrwkh57xtmpjjd	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	APPROVED	Approved	2026-06-25 08:43:10.267	2026-06-25 08:43:10.269	2026-06-25 08:43:10.269
cmqt98nml00qvwkh5t63hs7zm	cmqt98nii00qrwkh57xtmpjjd	2	Mall Director Approval	MALL_DIRECTOR	cmqt987oi0003wkh58oo99yj4	APPROVED	Approved	2026-06-25 08:43:10.364	2026-06-25 08:43:10.365	2026-06-25 08:43:10.365
cmqt98nnj00qxwkh5mmv9w7e4	cmqt98nii00qrwkh57xtmpjjd	3	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	APPROVED	Approved	2026-06-25 08:43:10.398	2026-06-25 08:43:10.399	2026-06-25 08:43:10.399
cmqt98noh00qzwkh53a17evsr	cmqt98nii00qrwkh57xtmpjjd	4	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	APPROVED	Approved	2026-06-25 08:43:10.432	2026-06-25 08:43:10.433	2026-06-25 08:43:10.433
cmqt98nqb00r3wkh5rqiw74q4	cmqt98npd00r1wkh5os1u0c73	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	APPROVED	Approved	2026-06-25 08:43:10.498	2026-06-25 08:43:10.499	2026-06-25 08:43:10.499
cmqt98nrg00r5wkh5qvjollms	cmqt98npd00r1wkh5os1u0c73	2	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	APPROVED	Approved	2026-06-25 08:43:10.539	2026-06-25 08:43:10.541	2026-06-25 08:43:10.541
cmqt98nse00r7wkh51v9pod9o	cmqt98npd00r1wkh5os1u0c73	3	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	APPROVED	Approved	2026-06-25 08:43:10.573	2026-06-25 08:43:10.574	2026-06-25 08:43:10.574
cmqt98nuh00rbwkh5y5yhe2lm	cmqt98ntj00r9wkh5dbv8o1ou	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	PENDING	\N	\N	2026-06-25 08:43:10.649	2026-06-25 08:43:10.649
cmqt98nve00rdwkh50ta1r83c	cmqt98ntj00r9wkh5dbv8o1ou	2	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	PENDING	\N	\N	2026-06-25 08:43:10.683	2026-06-25 08:43:10.683
cmqt98nwc00rfwkh535snv92r	cmqt98ntj00r9wkh5dbv8o1ou	3	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	PENDING	\N	\N	2026-06-25 08:43:10.716	2026-06-25 08:43:10.716
cmqt98nzm00rjwkh5fq27una0	cmqt98nyn00rhwkh52pgmk6un	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	PENDING	\N	\N	2026-06-25 08:43:10.834	2026-06-25 08:43:10.834
cmqt98o0r00rlwkh5mv3ekh4m	cmqt98nyn00rhwkh52pgmk6un	2	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	PENDING	\N	\N	2026-06-25 08:43:10.875	2026-06-25 08:43:10.875
cmqt98o1o00rnwkh5c7xunjnx	cmqt98nyn00rhwkh52pgmk6un	3	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	PENDING	\N	\N	2026-06-25 08:43:10.908	2026-06-25 08:43:10.908
cmqt98o3j00rrwkh5arcdsr37	cmqt98o2l00rpwkh5ehrvbefg	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	PENDING	\N	\N	2026-06-25 08:43:10.975	2026-06-25 08:43:10.975
cmqt98o5v00rtwkh5nqlywfur	cmqt98o2l00rpwkh5ehrvbefg	2	Mall Director Approval	MALL_DIRECTOR	cmqt987oi0003wkh58oo99yj4	PENDING	\N	\N	2026-06-25 08:43:11.059	2026-06-25 08:43:11.059
cmqt98o7000rvwkh5z58zlg35	cmqt98o2l00rpwkh5ehrvbefg	3	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	PENDING	\N	\N	2026-06-25 08:43:11.1	2026-06-25 08:43:11.1
cmqt98o7w00rxwkh58rylaydj	cmqt98o2l00rpwkh5ehrvbefg	4	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	PENDING	\N	\N	2026-06-25 08:43:11.133	2026-06-25 08:43:11.133
cmqt98oa100s1wkh5qj6ukjqh	cmqt98o8w00rzwkh5ka8s6y6d	1	Leasing Manager Approval	LEASING_MANAGER	cmqt987ne0002wkh5jxwbedq2	PENDING	\N	\N	2026-06-25 08:43:11.209	2026-06-25 08:43:11.209
cmqt98obd00s3wkh5dd0a3ept	cmqt98o8w00rzwkh5ka8s6y6d	2	Finance Review	FINANCE	cmqt987pp0004wkh5w0o8tqbi	PENDING	\N	\N	2026-06-25 08:43:11.258	2026-06-25 08:43:11.258
cmqt98oca00s5wkh5kdv9sc6z	cmqt98o8w00rzwkh5ka8s6y6d	3	Legal Review	LEGAL	cmqt987rd0005wkh5jvdn76v3	PENDING	\N	\N	2026-06-25 08:43:11.291	2026-06-25 08:43:11.291
\.


--
-- Data for Name: ApprovalWorkflow; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ApprovalWorkflow" (id, "entityType", "entityId", "proposalId", status, "createdAt", "updatedAt") FROM stdin;
cmqt98nii00qrwkh57xtmpjjd	PROPOSAL	cmqt98det009jwkh5j85g0xpj	cmqt98det009jwkh5j85g0xpj	APPROVED	2026-06-25 08:43:10.218	2026-06-25 08:43:10.218
cmqt98npd00r1wkh5os1u0c73	PROPOSAL	cmqt98dhd009lwkh5pvyk8eqq	cmqt98dhd009lwkh5pvyk8eqq	APPROVED	2026-06-25 08:43:10.465	2026-06-25 08:43:10.465
cmqt98ntj00r9wkh5dbv8o1ou	PROPOSAL	cmqt98dil009nwkh5d6mo0fkl	cmqt98dil009nwkh5d6mo0fkl	IN_PROGRESS	2026-06-25 08:43:10.615	2026-06-25 08:43:10.615
cmqt98nyn00rhwkh52pgmk6un	PROPOSAL	cmqt98djz009pwkh5a14v0peu	cmqt98djz009pwkh5a14v0peu	IN_PROGRESS	2026-06-25 08:43:10.799	2026-06-25 08:43:10.799
cmqt98o2l00rpwkh5ehrvbefg	PROPOSAL	cmqt98dlg009rwkh50zxulkku	cmqt98dlg009rwkh50zxulkku	IN_PROGRESS	2026-06-25 08:43:10.941	2026-06-25 08:43:10.941
cmqt98o8w00rzwkh5ka8s6y6d	PROPOSAL	cmqt98dmo009twkh52rho1rib	cmqt98dmo009twkh52rho1rib	IN_PROGRESS	2026-06-25 08:43:11.168	2026-06-25 08:43:11.168
\.


--
-- Data for Name: ArDunningLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ArDunningLog" (id, "invoiceId", "policyId", level, "sentAt") FROM stdin;
\.


--
-- Data for Name: ArDunningPolicy; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ArDunningPolicy" (id, code, name, level, "minDaysOverdue", "maxDaysOverdue", "notifyTenant", "notifyFinance", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt9881z000uwkh5cinjg24c	DUNNING_L1	Reminder Level 1	1	1	7	t	t	t	2026-06-25 08:42:50.183	2026-06-25 08:42:50.183
cmqt9881z000vwkh548up9ar2	DUNNING_L2	Reminder Level 2	2	8	30	t	t	t	2026-06-25 08:42:50.183	2026-06-25 08:42:50.183
cmqt9881z000wwkh5bbi5jfr8	DUNNING_L3	Escalation Level 3	3	31	\N	t	t	t	2026-06-25 08:42:50.183	2026-06-25 08:42:50.183
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."AuditLog" (id, "userId", action, "entityType", "entityId", endpoint, payload, "oldValue", "newValue", "ipAddress", "userAgent", duration, status, "errorMessage", "createdAt") FROM stdin;
cmqt98os100t1wkh50141sjyt	cmqt987kn0000wkh5eie55vj6	CREATE	MALL	cmqt9883d000xwkh5vdlw2qsa	\N	\N	\N	{"name":"THISO Mall Sala","code":"THISO-SALA"}	192.168.1.1	\N	\N	SUCCESS	\N	2026-06-25 08:43:11.858
cmqt98oue00t3wkh56dai272k	cmqt987ne0002wkh5jxwbedq2	UPDATE	CONTRACT	cmqt98drh009zwkh5l5nji1v1	\N	\N	{"status":"DRAFT"}	{"status":"ACTIVE"}	192.168.1.10	\N	\N	SUCCESS	\N	2026-06-25 08:43:11.942
cmqta5blk0001wqwxk9h81mzt	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98bhc006owkh5xlr6kob6	PUT /api/crm/leads/cmqt98bhc006owkh5xlr6kob6/move	{"status":"NEW","position":0}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	83	SUCCESS	\N	2026-06-25 09:08:34.424
cmqta5ckq0003wqwxgiwk2ebh	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98bhc006owkh5xlr6kob6	PUT /api/crm/leads/cmqt98bhc006owkh5xlr6kob6/move	{"status":"CONTACTED","position":1}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	85	SUCCESS	\N	2026-06-25 09:08:35.69
cmqtadj3d0005wqwxwl57wbn4	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98b9q006awkh5o6khpcgl	PUT /api/crm/leads/cmqt98b9q006awkh5o6khpcgl/move	{"status":"WON","position":0}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	200	SUCCESS	\N	2026-06-25 09:14:57.385
cmqtadm320007wqwxc9nofphj	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98bs80072wkh5vo1qjbsl	PUT /api/crm/leads/cmqt98bs80072wkh5vo1qjbsl/move	{"status":"WON","position":1}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	62	SUCCESS	\N	2026-06-25 09:15:01.263
cmr0b47lm000313z1b62fzpbj	cmqt987kn0000wkh5eie55vj6	POST	CRM	cmr0b47ik000113z1tmb7ha5k	POST /api/crm/leads	{"brandName":"coffee 1","contactName":"A","phone":"0328921550","email":"viinformationtechnology@gmail.com","category":"Coffee & Tea","expectedArea":200,"source":"REFERRAL","notes":"xxx","assignedToId":"cmqt987us0008wkh5bmcyunai"}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	112	SUCCESS	\N	2026-06-30 07:10:05.434
cmr0c8a6k000513z1g4242s04	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98bcy006gwkh5s495aeeo	PUT /api/crm/leads/cmqt98bcy006gwkh5s495aeeo	{"status":"NEGOTIATION"}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	1057	SUCCESS	\N	2026-06-30 07:41:15.02
cmr0clbxk000713z1ydvuplcn	cmqt987kn0000wkh5eie55vj6	POST	CONTRACT	cmqt98e2n00ajwkh5cputsdrs	POST /api/contracts/cmqt98e2n00ajwkh5cputsdrs/render-template	{"templateId":"cmqt98804000qwkh5rxxgln4n"}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	33	SUCCESS	\N	2026-06-30 07:51:23.816
cmr0clgfc000913z1k18s6fr9	cmqt987kn0000wkh5eie55vj6	POST	CONTRACT	cmqt98e2n00ajwkh5cputsdrs	POST /api/contracts/cmqt98e2n00ajwkh5cputsdrs/render-template	{"templateId":"cmqt98804000qwkh5rxxgln4n"}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	33	SUCCESS	\N	2026-06-30 07:51:29.64
cmr0cztcp000b13z1rp637vur	cmqt987kn0000wkh5eie55vj6	PUT	CRM	cmqt98a63004kwkh5vzonrqdr	PUT /api/crm/customers/cmqt98a63004kwkh5vzonrqdr	{"status":"ACTIVE"}	\N	\N	::ffff:172.25.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	1042	SUCCESS	\N	2026-06-30 08:02:39.576
\.


--
-- Data for Name: BankStatement; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."BankStatement" (id, "mallId", "bankAccount", "bankName", "statementDate", "openingBalance", "closingBalance", transactions, "importedById", "importedAt", "reconciledCount") FROM stdin;
\.


--
-- Data for Name: BillingConfig; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."BillingConfig" (id, "autoIssueInvoices", "notifyTenantOnIssue", "updatedAt") FROM stdin;
cmqt987z6000pwkh5bbtkp1t2	f	t	2026-06-25 08:42:50.083
\.


--
-- Data for Name: BillingScheduleEntry; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."BillingScheduleEntry" (id, "contractId", period, "periodStart", "periodEnd", "rentAmount", "camAmount", subtotal, "dueDate", status, "invoiceId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: BookingActivity; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."BookingActivity" (id, "bookingId", type, note, metadata, "performedById", "createdAt") FROM stdin;
cmqt98cup008xwkh5g014ua2x	cmqt98ct9008wwkh5vvgpjgv8	CREATED	Booking BK-2026-00001 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.401
cmqt98cwa008ywkh56k4besvw	cmqt98ct9008wwkh5vvgpjgv8	ACTIVATED	Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING	\N	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:56.458
cmqt98cyc0091wkh5hjfwu4zh	cmqt98cxe0090wkh5mopzq0xl	CREATED	Booking BK-2026-00002 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.533
cmqt98czi0092wkh5yofu12j8	cmqt98cxe0090wkh5mopzq0xl	ACTIVATED	Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING	\N	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:56.575
cmqt98d1t0095wkh53dlgwe12	cmqt98d0p0094wkh52hamw0ii	CREATED	Booking BK-2026-00003 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.658
cmqt98d310096wkh5io8f5zt1	cmqt98d0p0094wkh52hamw0ii	ACTIVATED	Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING	\N	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:56.701
cmqt98d5k0099wkh5iuz3ed35	cmqt98d4g0098wkh5x91t7tcp	CREATED	Booking BK-2026-00004 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.792
cmqt98d91009cwkh5eqv8gzqf	cmqt98d7v009bwkh54f2z0ndw	CREATED	Booking BK-2026-00005 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.917
cmqt98da6009dwkh5wmybt3gw	cmqt98d7v009bwkh54f2z0ndw	ACTIVATED	Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING	\N	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:56.958
cmqt98dch009gwkh5lie17m8c	cmqt98dbc009fwkh5slik65sr	CREATED	Booking BK-2026-00006 được tạo bởi sale	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:57.041
cmqt98ddm009hwkh5tw70ewt1	cmqt98dbc009fwkh5slik65sr	ACTIVATED	Booking đã được kích hoạt — unit chuyển sang trạng thái BOOKING	\N	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:57.083
\.


--
-- Data for Name: Building; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Building" (id, "mallId", name, code, "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt9884m000zwkh54qxb0m8c	cmqt9883d000xwkh5vdlw2qsa	Main Building	MB	t	2026-06-25 08:42:50.278	2026-06-25 08:42:50.278
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Category" (id, code, name, description, "parentId", "sortOrder", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt9894w002owkh5si36qbc4	FNB	F&B	Food & Beverage	\N	1	t	2026-06-25 08:42:51.584	2026-06-25 08:42:51.584
cmqt9896h002pwkh51w9j3hb1	FASHION	Fashion	Fashion & Apparel	\N	2	t	2026-06-25 08:42:51.641	2026-06-25 08:42:51.641
cmqt9897m002qwkh5pblytvnr	BEAUTY	Beauty & Wellness	Health, Beauty & Wellness	\N	3	t	2026-06-25 08:42:51.683	2026-06-25 08:42:51.683
cmqt9898j002rwkh5wk8568uy	TECH	Technology	Electronics & Technology	\N	4	t	2026-06-25 08:42:51.716	2026-06-25 08:42:51.716
cmqt9899o002swkh5zvgd0rrh	ENTERTAINMENT	Entertainment	Entertainment & Leisure	\N	5	t	2026-06-25 08:42:51.757	2026-06-25 08:42:51.757
cmqt989am002twkh5iihmdqor	CONVENIENCE	Convenience Store	Convenience & Mini Mart	\N	6	t	2026-06-25 08:42:51.791	2026-06-25 08:42:51.791
cmqt989br002uwkh5zshtqsi1	SUPERMARKET	Supermarket	Supermarket & Grocery	\N	7	t	2026-06-25 08:42:51.832	2026-06-25 08:42:51.832
cmqt989cx002vwkh5jb5fxdrd	SERVICES	Services	Services & Others	\N	8	t	2026-06-25 08:42:51.873	2026-06-25 08:42:51.873
cmqt989e3002wwkh5mwhsrgpj	FNB_COFFEE	Coffee & Tea	\N	cmqt9894w002owkh5si36qbc4	1	t	2026-06-25 08:42:51.915	2026-06-25 08:42:51.915
cmqt989e3002xwkh5l8wq3603	FNB_RESTAURANT	Restaurant	\N	cmqt9894w002owkh5si36qbc4	2	t	2026-06-25 08:42:51.915	2026-06-25 08:42:51.915
cmqt989e3002ywkh5iw8cnp6l	FNB_FASTFOOD	Fast Food	\N	cmqt9894w002owkh5si36qbc4	3	t	2026-06-25 08:42:51.915	2026-06-25 08:42:51.915
cmqt989e3002zwkh5z6s0xtr9	FNB_BAKERY	Bakery & Dessert	\N	cmqt9894w002owkh5si36qbc4	4	t	2026-06-25 08:42:51.915	2026-06-25 08:42:51.915
cmqt989ge0030wkh510w6hapv	FASHION_APPAREL	Apparel	\N	cmqt9896h002pwkh51w9j3hb1	1	t	2026-06-25 08:42:51.999	2026-06-25 08:42:51.999
cmqt989ge0031wkh5kvpl4wnw	FASHION_SHOES	Shoes & Footwear	\N	cmqt9896h002pwkh51w9j3hb1	2	t	2026-06-25 08:42:51.999	2026-06-25 08:42:51.999
cmqt989gf0032wkh5ge4nwkku	FASHION_ACCESSORIES	Accessories	\N	cmqt9896h002pwkh51w9j3hb1	3	t	2026-06-25 08:42:51.999	2026-06-25 08:42:51.999
\.


--
-- Data for Name: CategoryMallPricing; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."CategoryMallPricing" (id, "mallId", "categoryId", "floorId", "zoneId", "minRentPerSqm", "maxRentPerSqm", "suggestedRent", "camPerSqm", "effectiveFrom", "effectiveTo", notes, "isActive", "createdAt", "updatedAt", "createdById") FROM stdin;
cmqt989hp0034wkh5xgbbnbh2	cmqt9883d000xwkh5vdlw2qsa	cmqt9894w002owkh5si36qbc4	\N	\N	900000	1500000	1100000	130000	2026-01-01 00:00:00	\N	Standard pricing for FNB category	t	2026-06-25 08:42:52.045	2026-06-25 08:42:52.045	\N
cmqt989j70036wkh5nbkx4sru	cmqt9883d000xwkh5vdlw2qsa	cmqt9896h002pwkh51w9j3hb1	\N	\N	650000	1100000	850000	100000	2026-01-01 00:00:00	\N	Standard pricing for FASHION category	t	2026-06-25 08:42:52.1	2026-06-25 08:42:52.1	\N
cmqt989kd0038wkh5yphs9m3z	cmqt9883d000xwkh5vdlw2qsa	cmqt9897m002qwkh5pblytvnr	\N	\N	700000	1200000	900000	110000	2026-01-01 00:00:00	\N	Standard pricing for BEAUTY category	t	2026-06-25 08:42:52.141	2026-06-25 08:42:52.141	\N
cmqt989m8003awkh5h7pofjet	cmqt9883d000xwkh5vdlw2qsa	cmqt9898j002rwkh5wk8568uy	\N	\N	600000	1000000	750000	95000	2026-01-01 00:00:00	\N	Standard pricing for TECH category	t	2026-06-25 08:42:52.209	2026-06-25 08:42:52.209	\N
cmqt989nd003cwkh5jhpq32wx	cmqt9883d000xwkh5vdlw2qsa	cmqt9899o002swkh5zvgd0rrh	\N	\N	400000	700000	500000	70000	2026-01-01 00:00:00	\N	Standard pricing for ENTERTAINMENT category	t	2026-06-25 08:42:52.249	2026-06-25 08:42:52.249	\N
cmqt989oj003ewkh5ig6nve40	cmqt9883d000xwkh5vdlw2qsa	cmqt989am002twkh5iihmdqor	\N	\N	800000	1200000	950000	120000	2026-01-01 00:00:00	\N	Standard pricing for CONVENIENCE category	t	2026-06-25 08:42:52.291	2026-06-25 08:42:52.291	\N
cmqt989pp003gwkh5zvxq9ia7	cmqt9883d000xwkh5vdlw2qsa	cmqt989br002uwkh5zshtqsi1	\N	\N	300000	500000	380000	60000	2026-01-01 00:00:00	\N	Standard pricing for SUPERMARKET category	t	2026-06-25 08:42:52.333	2026-06-25 08:42:52.333	\N
cmqt989sc003iwkh5mxwzaaji	cmqt9883d000xwkh5vdlw2qsa	cmqt989cx002vwkh5jb5fxdrd	\N	\N	500000	900000	650000	85000	2026-01-01 00:00:00	\N	Standard pricing for SERVICES category	t	2026-06-25 08:42:52.427	2026-06-25 08:42:52.427	\N
cmqt989te003kwkh5orzv0llw	cmqt9883d000xwkh5vdlw2qsa	cmqt9894w002owkh5si36qbc4	cmqt9885u0011wkh5dzy8mesq	\N	1080000	1950000	1375000	143000	2026-01-01 00:00:00	\N	Premium Ground Floor pricing for FNB	t	2026-06-25 08:42:52.467	2026-06-25 08:42:52.467	\N
cmqt989uc003mwkh5sie619a5	cmqt9883d000xwkh5vdlw2qsa	cmqt9896h002pwkh51w9j3hb1	cmqt9885u0011wkh5dzy8mesq	\N	780000	1430000	1062500	110000	2026-01-01 00:00:00	\N	Premium Ground Floor pricing for FASHION	t	2026-06-25 08:42:52.5	2026-06-25 08:42:52.5	\N
cmqt989vi003owkh5znpdk2s9	cmqt9883d000xwkh5vdlw2qsa	cmqt9897m002qwkh5pblytvnr	cmqt9885u0011wkh5dzy8mesq	\N	840000	1560000	1125000	121000	2026-01-01 00:00:00	\N	Premium Ground Floor pricing for BEAUTY	t	2026-06-25 08:42:52.542	2026-06-25 08:42:52.542	\N
cmqt989wg003qwkh53kev4tok	cmqt9883d000xwkh5vdlw2qsa	cmqt9898j002rwkh5wk8568uy	cmqt9885u0011wkh5dzy8mesq	\N	720000	1300000	937500	104500	2026-01-01 00:00:00	\N	Premium Ground Floor pricing for TECH	t	2026-06-25 08:42:52.576	2026-06-25 08:42:52.576	\N
\.


--
-- Data for Name: ComplianceExport; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ComplianceExport" (id, "exportType", "mallId", "periodStart", "periodEnd", "filePath", status, "requestedBy", "completedAt", "errorMessage", "createdAt") FROM stdin;
\.


--
-- Data for Name: Contract; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Contract" (id, "contractNumber", "proposalId", "tenantId", "unitId", type, status, "startDate", "endDate", term, rent, cam, deposit, "billingCycle", "paymentTerm", "rentFree", "escalationPercent", "managedById", notes, "isActive", "deletedAt", "createdAt", "updatedAt", "templateId") FROM stdin;
cmqt98drh009zwkh5l5nji1v1	CTR-2026-0001	cmqt98det009jwkh5j85g0xpj	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	120000000	15000000	360000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Highlands Coffee at unit GF-A01	t	\N	2026-06-25 08:42:57.581	2026-06-25 08:42:57.581	\N
cmqt98dtn00a1wkh5b9uom5zz	CTR-2026-0002	cmqt98dhd009lwkh5pvyk8eqq	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	156000000	19500000	468000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Jollibee at unit GF-A02	t	\N	2026-06-25 08:42:57.659	2026-06-25 08:42:57.659	\N
cmqt98dur00a3wkh5q5pw84sv	CTR-2026-0003	cmqt98dil009nwkh5d6mo0fkl	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	70000000	8400000	210000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Uniqlo at unit GF-B01	t	\N	2026-06-25 08:42:57.699	2026-06-25 08:42:57.699	\N
cmqt98dvn00a5wkh5hej394zc	CTR-2026-0004	cmqt98djz009pwkh5a14v0peu	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	162000000	19800000	486000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Guardian at unit GF-B02	t	\N	2026-06-25 08:42:57.732	2026-06-25 08:42:57.732	\N
cmqt98dwe00a7wkh5hp7gogh6	CTR-2026-0005	cmqt98dlg009rwkh50zxulkku	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	229500000	27000000	688500000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Circle K at unit GF-C01	t	\N	2026-06-25 08:42:57.758	2026-06-25 08:42:57.758	\N
cmqt98dxk00a9wkh5t8otion2	CTR-2026-0006	cmqt98dmo009twkh52rho1rib	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	202500000	24750000	607500000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for McDonald's at unit GF-C02	t	\N	2026-06-25 08:42:57.8	2026-06-25 08:42:57.8	\N
cmqt98dyp00abwkh5qn146x5y	CTR-2026-0007	cmqt98dnt009vwkh5bac5obfj	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	160000000	20800000	480000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for The Coffee House at unit L1-A01	t	\N	2026-06-25 08:42:57.842	2026-06-25 08:42:57.842	\N
cmqt98dzn00adwkh54jj4vy7b	CTR-2026-0008	cmqt98dq8009xwkh538m7i6hf	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	200000000	26000000	600000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Shopee at unit L1-A02	t	\N	2026-06-25 08:42:57.875	2026-06-25 08:42:57.875	\N
cmqt98e0s00afwkh508v2zc4j	CTR-2026-0009	\N	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	108000000	13500000	324000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for FPT Retail at unit L1-B01	t	\N	2026-06-25 08:42:57.917	2026-06-25 08:42:57.917	\N
cmqt98e1q00ahwkh5jk14ngi6	CTR-2026-0010	\N	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	LEASE_AGREEMENT	ACTIVE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	129600000	16200000	388800000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Lotteria at unit L1-B02	t	\N	2026-06-25 08:42:57.95	2026-06-25 08:42:57.95	\N
cmqt98e2n00ajwkh5cputsdrs	CTR-2026-0011	\N	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	LEASE_AGREEMENT	EXPIRING	2024-01-01 00:00:00	2026-08-31 00:00:00	36	120000000	15000000	360000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Highlands Coffee at unit GF-A01	t	\N	2026-06-25 08:42:57.983	2026-06-25 08:42:57.983	\N
cmqt98e3l00alwkh58r7mogzv	CTR-2026-0012	\N	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	LEASE_AGREEMENT	EXPIRING	2024-01-01 00:00:00	2026-08-31 00:00:00	36	156000000	19500000	468000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Jollibee at unit GF-A02	t	\N	2026-06-25 08:42:58.017	2026-06-25 08:42:58.017	\N
cmqt98e4q00anwkh5ah4735c0	CTR-2026-0013	\N	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	LEASE_AGREEMENT	PENDING_SIGNATURE	2024-06-01 00:00:00	2027-05-31 00:00:00	36	70000000	8400000	210000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Uniqlo at unit GF-B01	t	\N	2026-06-25 08:42:58.058	2026-06-25 08:42:58.058	\N
cmqt98e5n00apwkh50qhfdrdk	CTR-2026-0014	\N	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	LEASE_AGREEMENT	DRAFT	2024-06-01 00:00:00	2027-05-31 00:00:00	36	162000000	19800000	486000000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Guardian at unit GF-B02	t	\N	2026-06-25 08:42:58.092	2026-06-25 08:42:58.092	\N
cmqt98e6t00arwkh55y2x3r3k	CTR-2026-0015	\N	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	LEASE_AGREEMENT	DRAFT	2024-06-01 00:00:00	2027-05-31 00:00:00	36	229500000	27000000	688500000	MONTHLY	30	0	5	cmqt987ne0002wkh5jxwbedq2	Lease agreement for Circle K at unit GF-C01	t	\N	2026-06-25 08:42:58.133	2026-06-25 08:42:58.133	\N
\.


--
-- Data for Name: ContractAmendment; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractAmendment" (id, "contractId", "amendmentNumber", type, status, "effectiveDate", changes, reason, "submittedAt", "approvedAt", "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ContractClause; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractClause" (id, "templateId", code, title, content, "order", "isRequired", "createdAt") FROM stdin;
cmqt98804000rwkh5b9b61oie	cmqt98804000qwkh5rxxgln4n	RENT	Điều khoản tiền thuê	Bên thuê thanh toán tiền thuê {{rent}} VNĐ/tháng.	1	t	2026-06-25 08:42:50.117
cmqt98804000swkh5522velj4	cmqt98804000qwkh5rxxgln4n	CAM	Phí dịch vụ chung	Phí CAM {{cam}} VNĐ/tháng.	2	t	2026-06-25 08:42:50.117
cmqt98804000twkh564ndmopr	cmqt98804000qwkh5rxxgln4n	TERM	Thời hạn hợp đồng	Hợp đồng có hiệu lực từ {{startDate}} đến {{endDate}}.	3	t	2026-06-25 08:42:50.117
\.


--
-- Data for Name: ContractEvent; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractEvent" (id, "contractId", "eventType", title, description, "beforeValue", "afterValue", "userId", metadata, "createdAt") FROM stdin;
\.


--
-- Data for Name: ContractFile; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractFile" (id, "contractId", "fileName", "filePath", "fileType", "fileSize", "uploadedById", "sha256Hash", "signedAt", "signerName", "signerRole", "verifyCode", "createdAt") FROM stdin;
\.


--
-- Data for Name: ContractTemplate; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractTemplate" (id, code, name, "contractType", content, "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98804000qwkh5rxxgln4n	LEASE_STANDARD	Standard Lease Agreement	LEASE_AGREEMENT	Hợp đồng thuê mặt bằng số {{contractNumber}} giữa THISO Mall và {{tenantName}} ({{companyName}}) cho lô {{unitCode}}. Tiền thuê: {{rent}} VNĐ/tháng. CAM: {{cam}} VNĐ/tháng. Thời hạn: {{startDate}} — {{endDate}} ({{term}} tháng).	t	2026-06-25 08:42:50.117	2026-06-25 08:42:50.117
\.


--
-- Data for Name: ContractTermination; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ContractTermination" (id, "contractId", "initiatedBy", reason, "effectiveDate", "noticePeriodDays", "depositRefund", "penaltyAmount", "handoverDate", "handoverCondition", "utilityFinalRead", "accessCardReturn", "signageRemoved", "keysReturned", status, "completedAt", notes, "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Customer" (id, "customerCode", "companyName", "brandName", "taxCode", industry, "contactName", "contactTitle", phone, email, address, website, source, status, "preferredCategory", "preferredCategoryId", "expectedArea", "budgetMin", "budgetMax", rating, "assignedToId", "tenantId", "createdById", notes, "wonAt", "lostAt", "lostReason", "isActive", "deletedAt", "createdAt", "updatedAt") FROM stdin;
cmqt98a440049wkh5pysvmwcd	CUST-003	Starbucks Vietnam Co., Ltd	Starbucks	\N	F&B	Sarah Johnson	\N	0291234569	sarah@starbucks.com.vn	\N	\N	REFERRAL	NEGOTIATING	F&B	\N	150	1000000	1300000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.839	2026-06-25 08:42:52.839
cmqt98a46004dwkh5dstb7fpk	CUST-002	Inditex Vietnam Co., Ltd	Zara	\N	Fashion	Carlos Rodriguez	\N	0291234568	carlos@zara.com.vn	\N	\N	WEBSITE	NEGOTIATING	Fashion	\N	300	700000	900000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.839	2026-06-25 08:42:52.839
cmqt98a48004fwkh5cihp2jcx	CUST-008	CellphoneS JSC	CellphoneS	\N	Technology	Tran Minh Quan	\N	0291234575	quan@cellphones.com.vn	\N	\N	REFERRAL	PROSPECT	Technology	\N	120	700000	850000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.84	2026-06-25 08:42:52.84
cmqt98a63004kwkh5vzonrqdr	CUST-010	LVMH Beauty Vietnam Co., Ltd	Sephora	\N	Health & Beauty	Isabelle Martin	\N	0291234582	isabelle@sephora.com.vn	\N	\N	BROKER	ACTIVE	Health & Beauty	\N	250	900000	1100000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	2026-06-30 08:02:38.55	\N	\N	t	\N	2026-06-25 08:42:52.871	2026-06-30 08:02:38.551
cmqt98a47004ewkh5lh79fbsw	CUST-004	H&M Vietnam Co., Ltd	H&M	\N	Fashion	Erik Svensson	\N	0291234570	erik@hm.com.vn	\N	\N	WEBSITE	PROSPECT	Fashion	\N	400	650000	850000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.839	2026-06-25 08:42:52.839
cmqt98a45004cwkh586rwbwtn	CUST-006	AS Watson Vietnam Co., Ltd	Watsons	\N	Health & Beauty	Michelle Tan	\N	0291234572	michelle@watsons.com.vn	\N	\N	BROKER	NEGOTIATING	Health & Beauty	\N	200	800000	1000000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.84	2026-06-25 08:42:52.84
cmqt98a44004awkh5x2v5hz43	CUST-005	Pizza Hut Vietnam Co., Ltd	Pizza Hut	\N	F&B	David Lee	\N	0291234571	david@pizzahut.com.vn	\N	\N	WALK_IN	PROSPECT	F&B	\N	180	750000	950000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.839	2026-06-25 08:42:52.839
cmqt98a49004gwkh5gyn1zj9f	CUST-007	CJ CGV Vietnam Co., Ltd	CGV Cinemas	\N	Entertainment	Kim Dong Hyun	\N	0291234583	donghyun@cgv.vn	\N	\N	BROKER	NEGOTIATING	Entertainment	\N	2000	350000	500000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.84	2026-06-25 08:42:52.84
cmqt98a4n004iwkh5wtayg8h8	CUST-009	Phuc Long Heritage Co., Ltd	Phuc Long Coffee	\N	F&B	Le Quoc Hung	\N	0291234576	hung@phuclong.com.vn	\N	\N	BROKER	NEGOTIATING	F&B	\N	160	900000	1100000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.87	2026-06-25 08:42:52.87
cmqt98a45004bwkh5sz50av0f	CUST-001	KFC Vietnam Co., Ltd	KFC	\N	F&B	Robert Brown	\N	0291234567	robert@kfc.com.vn	\N	\N	BROKER	ACTIVE	F&B	\N	200	800000	1000000	3	\N	\N	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	\N	t	\N	2026-06-25 08:42:52.838	2026-06-25 09:14:57.345
\.


--
-- Data for Name: CustomerActivity; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."CustomerActivity" (id, "customerId", type, subject, note, "scheduledAt", "completedAt", outcome, "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: DealScoreCriterion; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."DealScoreCriterion" (id, code, name, "fieldSource", weight, "minScore", "maxScore", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt987x3000jwkh5ej8hjl92	CUSTOMER_RATING	Customer rating	CUSTOMER_RATING	1.5	0	100	t	2026-06-25 08:42:50.007	2026-06-25 08:42:50.007
cmqt987x3000kwkh5kqgdu6vc	BRAND_STRENGTH	Brand strength	BRAND_STRENGTH	1.2	0	100	t	2026-06-25 08:42:50.007	2026-06-25 08:42:50.007
cmqt987x3000lwkh5frmxjhas	FINANCIAL_CAPACITY	Financial capacity	FINANCIAL_CAPACITY	1.3	0	100	t	2026-06-25 08:42:50.007	2026-06-25 08:42:50.007
cmqt987x3000mwkh59vugzsga	INDUSTRY_FIT	Industry fit	INDUSTRY_FIT	1	0	100	t	2026-06-25 08:42:50.007	2026-06-25 08:42:50.007
cmqt987x3000nwkh5ogsw63zp	DISCOUNT_RISK	Discount & rent-free risk	DISCOUNT_RISK	1.5	0	100	t	2026-06-25 08:42:50.007	2026-06-25 08:42:50.007
\.


--
-- Data for Name: DepositAccount; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."DepositAccount" (id, "contractId", "tenantId", "depositAmount", "receivedAmount", "bankAccount", "receivedDate", "refundDate", "refundAmount", deductions, status, notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: DocumentDownloadLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."DocumentDownloadLog" (id, "documentId", "userId", "downloadedAt", "ipAddress", purpose) FROM stdin;
\.


--
-- Data for Name: FitoutChecklist; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutChecklist" (id, "projectId", title, description, "isCompleted", "completedById", "completedAt", "order", "createdAt") FROM stdin;
cmqt98e8w00avwkh5junh59ty	cmqt98e7s00atwkh5cx14ptrn	Submit design drawings	Complete submit design drawings per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	0	2026-06-25 08:42:58.208
cmqt98ea100axwkh5bdi7rydv	cmqt98e7s00atwkh5cx14ptrn	Fire safety review	Complete fire safety review per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	1	2026-06-25 08:42:58.249
cmqt98eb600azwkh51oaqqmah	cmqt98e7s00atwkh5cx14ptrn	Structural approval	Complete structural approval per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	2	2026-06-25 08:42:58.29
cmqt98ec400b1wkh5icmb6dvu	cmqt98e7s00atwkh5cx14ptrn	MEP installation	Complete mep installation per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	3	2026-06-25 08:42:58.324
cmqt98ed100b3wkh59zll2fpl	cmqt98e7s00atwkh5cx14ptrn	Interior fit-out	Complete interior fit-out per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	4	2026-06-25 08:42:58.357
cmqt98edz00b5wkh5og2opa2a	cmqt98e7s00atwkh5cx14ptrn	Safety inspection	Complete safety inspection per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	5	2026-06-25 08:42:58.391
cmqt98eew00b7wkh5kfl6w1dg	cmqt98e7s00atwkh5cx14ptrn	Final walkthrough	Complete final walkthrough per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	6	2026-06-25 08:42:58.424
cmqt98egz00bbwkh5nq7yof86	cmqt98eft00b9wkh5qstw367c	Submit design drawings	Complete submit design drawings per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	0	2026-06-25 08:42:58.499
cmqt98ehw00bdwkh53torojxy	cmqt98eft00b9wkh5qstw367c	Fire safety review	Complete fire safety review per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	1	2026-06-25 08:42:58.532
cmqt98eit00bfwkh55joropap	cmqt98eft00b9wkh5qstw367c	Structural approval	Complete structural approval per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	2	2026-06-25 08:42:58.565
cmqt98el500bhwkh53rqdh6dd	cmqt98eft00b9wkh5qstw367c	MEP installation	Complete mep installation per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	3	2026-06-25 08:42:58.649
cmqt98em200bjwkh5jupxy6ae	cmqt98eft00b9wkh5qstw367c	Interior fit-out	Complete interior fit-out per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	4	2026-06-25 08:42:58.682
cmqt98emz00blwkh5i0cv29hm	cmqt98eft00b9wkh5qstw367c	Safety inspection	Complete safety inspection per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	5	2026-06-25 08:42:58.716
cmqt98enx00bnwkh5rq12munl	cmqt98eft00b9wkh5qstw367c	Final walkthrough	Complete final walkthrough per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	6	2026-06-25 08:42:58.749
cmqt98eps00brwkh51vcjrecd	cmqt98eov00bpwkh5tow8rn26	Submit design drawings	Complete submit design drawings per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	0	2026-06-25 08:42:58.816
cmqt98esc00btwkh5qr9d6gyw	cmqt98eov00bpwkh5tow8rn26	Fire safety review	Complete fire safety review per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	1	2026-06-25 08:42:58.908
cmqt98et900bvwkh5sy69arwx	cmqt98eov00bpwkh5tow8rn26	Structural approval	Complete structural approval per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	2	2026-06-25 08:42:58.941
cmqt98euf00bxwkh5q14w12l5	cmqt98eov00bpwkh5tow8rn26	MEP installation	Complete mep installation per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	3	2026-06-25 08:42:58.983
cmqt98evn00bzwkh5h9ete3nm	cmqt98eov00bpwkh5tow8rn26	Interior fit-out	Complete interior fit-out per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	4	2026-06-25 08:42:59.027
cmqt98ewt00c1wkh51n1u9nvh	cmqt98eov00bpwkh5tow8rn26	Safety inspection	Complete safety inspection per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	5	2026-06-25 08:42:59.069
cmqt98exy00c3wkh58d3q5570	cmqt98eov00bpwkh5tow8rn26	Final walkthrough	Complete final walkthrough per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	6	2026-06-25 08:42:59.11
cmqt98f0700c7wkh5mj0so3yr	cmqt98ez400c5wkh59z4xyu1v	Submit design drawings	Complete submit design drawings per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	0	2026-06-25 08:42:59.191
cmqt98f1500c9wkh5cuydzhpv	cmqt98ez400c5wkh59z4xyu1v	Fire safety review	Complete fire safety review per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	1	2026-06-25 08:42:59.225
cmqt98f2100cbwkh5g1f4mp6h	cmqt98ez400c5wkh59z4xyu1v	Structural approval	Complete structural approval per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	2	2026-06-25 08:42:59.258
cmqt98f2z00cdwkh5o5k968ye	cmqt98ez400c5wkh59z4xyu1v	MEP installation	Complete mep installation per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	3	2026-06-25 08:42:59.292
cmqt98f3w00cfwkh5d40uo3ps	cmqt98ez400c5wkh59z4xyu1v	Interior fit-out	Complete interior fit-out per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	4	2026-06-25 08:42:59.324
cmqt98f4u00chwkh52jv9moj8	cmqt98ez400c5wkh59z4xyu1v	Safety inspection	Complete safety inspection per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	5	2026-06-25 08:42:59.358
cmqt98f5s00cjwkh54bt186l6	cmqt98ez400c5wkh59z4xyu1v	Final walkthrough	Complete final walkthrough per mall guidelines	t	cmqt987si0006wkh56418hk6e	2024-03-01 00:00:00	6	2026-06-25 08:42:59.392
cmqt98f8400cnwkh53jdq5nno	cmqt98f6z00clwkh514t34vko	Submit design drawings	Complete submit design drawings per mall guidelines	f	\N	\N	0	2026-06-25 08:42:59.476
cmqt98f9700cpwkh5z2pflyif	cmqt98f6z00clwkh514t34vko	Fire safety review	Complete fire safety review per mall guidelines	f	\N	\N	1	2026-06-25 08:42:59.515
cmqt98fa400crwkh53uw2fmhs	cmqt98f6z00clwkh514t34vko	Structural approval	Complete structural approval per mall guidelines	f	\N	\N	2	2026-06-25 08:42:59.549
cmqt98fb200ctwkh5nrbss3m3	cmqt98f6z00clwkh514t34vko	MEP installation	Complete mep installation per mall guidelines	f	\N	\N	3	2026-06-25 08:42:59.583
cmqt98fc000cvwkh5xn4i71s3	cmqt98f6z00clwkh514t34vko	Interior fit-out	Complete interior fit-out per mall guidelines	f	\N	\N	4	2026-06-25 08:42:59.616
cmqt98fd600cxwkh58df172lj	cmqt98f6z00clwkh514t34vko	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:42:59.658
cmqt98feb00czwkh58q1dg096	cmqt98f6z00clwkh514t34vko	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:42:59.699
cmqt98fho00d3wkh5j1828qrb	cmqt98ff900d1wkh56r0b419k	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:42:59.819
cmqt98fis00d5wkh56mntfr6m	cmqt98ff900d1wkh56r0b419k	Fire safety review	Complete fire safety review per mall guidelines	f	\N	\N	1	2026-06-25 08:42:59.86
cmqt98fjy00d7wkh5ma2t4755	cmqt98ff900d1wkh56r0b419k	Structural approval	Complete structural approval per mall guidelines	f	\N	\N	2	2026-06-25 08:42:59.902
cmqt98fl400d9wkh596k1f85k	cmqt98ff900d1wkh56r0b419k	MEP installation	Complete mep installation per mall guidelines	f	\N	\N	3	2026-06-25 08:42:59.944
cmqt98fm700dbwkh57h0ubub2	cmqt98ff900d1wkh56r0b419k	Interior fit-out	Complete interior fit-out per mall guidelines	f	\N	\N	4	2026-06-25 08:42:59.983
cmqt98fn600ddwkh5tjo339fz	cmqt98ff900d1wkh56r0b419k	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:43:00.018
cmqt98foc00dfwkh5wop0hg4a	cmqt98ff900d1wkh56r0b419k	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:00.06
cmqt98fql00djwkh5ia5iqij2	cmqt98fph00dhwkh5u6250zqc	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:00.141
cmqt98fru00dlwkh5v00domws	cmqt98fph00dhwkh5u6250zqc	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:00.185
cmqt98fsz00dnwkh5hxzqyzu6	cmqt98fph00dhwkh5u6250zqc	Structural approval	Complete structural approval per mall guidelines	f	\N	\N	2	2026-06-25 08:43:00.227
cmqt98fu500dpwkh5s1v1g4rb	cmqt98fph00dhwkh5u6250zqc	MEP installation	Complete mep installation per mall guidelines	f	\N	\N	3	2026-06-25 08:43:00.269
cmqt98fvb00drwkh54ml7qv9l	cmqt98fph00dhwkh5u6250zqc	Interior fit-out	Complete interior fit-out per mall guidelines	f	\N	\N	4	2026-06-25 08:43:00.311
cmqt98fwg00dtwkh5sbpd0zho	cmqt98fph00dhwkh5u6250zqc	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:43:00.352
cmqt98fxj00dvwkh5duczuplq	cmqt98fph00dhwkh5u6250zqc	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:00.391
cmqt98fzl00dzwkh5jdli9djk	cmqt98fyp00dxwkh57o0eunvg	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:00.466
cmqt98g0j00e1wkh5ymhn81at	cmqt98fyp00dxwkh57o0eunvg	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:00.5
cmqt98g1g00e3wkh50okm2pf6	cmqt98fyp00dxwkh57o0eunvg	Structural approval	Complete structural approval per mall guidelines	t	\N	\N	2	2026-06-25 08:43:00.533
cmqt98g2e00e5wkh51250jpe0	cmqt98fyp00dxwkh57o0eunvg	MEP installation	Complete mep installation per mall guidelines	f	\N	\N	3	2026-06-25 08:43:00.566
cmqt98g3b00e7wkh5cecv2yim	cmqt98fyp00dxwkh57o0eunvg	Interior fit-out	Complete interior fit-out per mall guidelines	f	\N	\N	4	2026-06-25 08:43:00.599
cmqt98g4800e9wkh5zv7uwkaz	cmqt98fyp00dxwkh57o0eunvg	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:43:00.632
cmqt98g5500ebwkh5829wv62q	cmqt98fyp00dxwkh57o0eunvg	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:00.665
cmqt98g7000efwkh5zvgkr7ch	cmqt98g6300edwkh5e1mkqz6n	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:00.733
cmqt98g7y00ehwkh5nsyi1hvv	cmqt98g6300edwkh5e1mkqz6n	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:00.766
cmqt98g8v00ejwkh5x2vy6xdo	cmqt98g6300edwkh5e1mkqz6n	Structural approval	Complete structural approval per mall guidelines	t	\N	\N	2	2026-06-25 08:43:00.799
cmqt98g9s00elwkh5o3upp5pq	cmqt98g6300edwkh5e1mkqz6n	MEP installation	Complete mep installation per mall guidelines	t	\N	\N	3	2026-06-25 08:43:00.833
cmqt98gaq00enwkh5lcavho60	cmqt98g6300edwkh5e1mkqz6n	Interior fit-out	Complete interior fit-out per mall guidelines	f	\N	\N	4	2026-06-25 08:43:00.866
cmqt98gd400epwkh5zb1cyeyf	cmqt98g6300edwkh5e1mkqz6n	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:43:00.952
cmqt98ge700erwkh5i6gp2oia	cmqt98g6300edwkh5e1mkqz6n	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:00.992
cmqt98gg200evwkh5umtahoj3	cmqt98gf500etwkh5cg8n6swl	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:01.058
cmqt98gh000exwkh5tcxirzdl	cmqt98gf500etwkh5cg8n6swl	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:01.092
cmqt98ghx00ezwkh52qfgwvpb	cmqt98gf500etwkh5cg8n6swl	Structural approval	Complete structural approval per mall guidelines	t	\N	\N	2	2026-06-25 08:43:01.125
cmqt98gk900f1wkh56olyl5dx	cmqt98gf500etwkh5cg8n6swl	MEP installation	Complete mep installation per mall guidelines	t	\N	\N	3	2026-06-25 08:43:01.209
cmqt98gl700f3wkh5m2cdiz4w	cmqt98gf500etwkh5cg8n6swl	Interior fit-out	Complete interior fit-out per mall guidelines	t	\N	\N	4	2026-06-25 08:43:01.243
cmqt98gmc00f5wkh5kghkrscr	cmqt98gf500etwkh5cg8n6swl	Safety inspection	Complete safety inspection per mall guidelines	f	\N	\N	5	2026-06-25 08:43:01.284
cmqt98gnh00f7wkh5brn71r3k	cmqt98gf500etwkh5cg8n6swl	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:01.325
cmqt98gpm00fbwkh583f9v6oq	cmqt98goe00f9wkh592utifez	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:01.402
cmqt98gs400fdwkh5yrvi47v7	cmqt98goe00f9wkh592utifez	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:01.492
cmqt98gt900ffwkh53pgwi1ty	cmqt98goe00f9wkh592utifez	Structural approval	Complete structural approval per mall guidelines	t	\N	\N	2	2026-06-25 08:43:01.534
cmqt98guf00fhwkh5zxrwj7uw	cmqt98goe00f9wkh592utifez	MEP installation	Complete mep installation per mall guidelines	t	\N	\N	3	2026-06-25 08:43:01.575
cmqt98gvk00fjwkh5mri0201u	cmqt98goe00f9wkh592utifez	Interior fit-out	Complete interior fit-out per mall guidelines	t	\N	\N	4	2026-06-25 08:43:01.616
cmqt98gwh00flwkh5pdiqzk98	cmqt98goe00f9wkh592utifez	Safety inspection	Complete safety inspection per mall guidelines	t	\N	\N	5	2026-06-25 08:43:01.65
cmqt98gxe00fnwkh57opkj437	cmqt98goe00f9wkh592utifez	Final walkthrough	Complete final walkthrough per mall guidelines	f	\N	\N	6	2026-06-25 08:43:01.683
cmqt98h1t00frwkh5et7wspwi	cmqt98h0f00fpwkh5fe7tvvuu	Submit design drawings	Complete submit design drawings per mall guidelines	t	\N	\N	0	2026-06-25 08:43:01.841
cmqt98h2x00ftwkh5uq6sgf2q	cmqt98h0f00fpwkh5fe7tvvuu	Fire safety review	Complete fire safety review per mall guidelines	t	\N	\N	1	2026-06-25 08:43:01.881
cmqt98h3o00fvwkh5xtqemwfm	cmqt98h0f00fpwkh5fe7tvvuu	Structural approval	Complete structural approval per mall guidelines	t	\N	\N	2	2026-06-25 08:43:01.908
cmqt98h4l00fxwkh5krr4ogmi	cmqt98h0f00fpwkh5fe7tvvuu	MEP installation	Complete mep installation per mall guidelines	t	\N	\N	3	2026-06-25 08:43:01.941
cmqt98h5i00fzwkh5m46nx14m	cmqt98h0f00fpwkh5fe7tvvuu	Interior fit-out	Complete interior fit-out per mall guidelines	t	\N	\N	4	2026-06-25 08:43:01.975
cmqt98h6p00g1wkh5789bkvgq	cmqt98h0f00fpwkh5fe7tvvuu	Safety inspection	Complete safety inspection per mall guidelines	t	\N	\N	5	2026-06-25 08:43:02.018
cmqt98h7t00g3wkh51qwzm4l7	cmqt98h0f00fpwkh5fe7tvvuu	Final walkthrough	Complete final walkthrough per mall guidelines	t	\N	\N	6	2026-06-25 08:43:02.058
\.


--
-- Data for Name: FitoutContractor; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutContractor" (id, "projectId", "companyName", "licenseNo", "contactName", phone, email, "startDate", "endDate", "isActive", "createdAt") FROM stdin;
cmqt98qhh00utwkh5ck49gspf	cmqt98e7s00atwkh5cx14ptrn	Công ty Xây dựng ABC	GXD-2024-001	Nguyễn Văn Thầu	0912345678	contact@abc-construction.vn	2024-02-01 00:00:00	2024-04-30 00:00:00	t	2026-06-25 08:43:14.069
\.


--
-- Data for Name: FitoutDocument; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutDocument" (id, "projectId", "documentType", "fileName", "filePath", "fileSizeKb", status, "requiredFor", "uploadedById", "reviewedById", "reviewedAt", "reviewNote", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: FitoutDocumentGate; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutDocumentGate" (id, stage, "documentType", "isRequired", description, "order", "isActive", "createdAt") FROM stdin;
cmqt98ovb00t4wkh5gvt9tp67	SUBMIT_DESIGN	DESIGN_DRAWING	t	Layout design drawings	1	t	2026-06-25 08:43:11.975
cmqt98owi00t5wkh5xnzkbexw	SUBMIT_DESIGN	MEP_DRAWING	t	MEP (M&E) drawings	2	t	2026-06-25 08:43:12.018
cmqt98oxn00t6wkh54e2w0csn	FIRE_SAFETY_REVIEW	FIRE_SAFETY_CERT	t	Fire safety certificate	1	t	2026-06-25 08:43:12.06
cmqt98oyt00t7wkh54hzfmwom	FIRE_SAFETY_REVIEW	PCCC_APPROVAL	t	PCCC approval document	2	t	2026-06-25 08:43:12.102
cmqt98ozx00t8wkh5dw5045b9	CONSTRUCTION_PERMIT	CONSTRUCTION_PERMIT	t	Construction permit	1	t	2026-06-25 08:43:12.141
cmqt98p0v00t9wkh5ha2vb8uu	CONSTRUCTION_PERMIT	INSURANCE_CERT	t	Insurance certificate	2	t	2026-06-25 08:43:12.175
cmqt98p1s00tawkh5y0fbawgo	INSPECTION	INSPECTION_REPORT	t	Final inspection report	1	t	2026-06-25 08:43:12.208
cmqt98p2p00tbwkh5l5bzd3w4	APPROVED_TO_OPEN	HANDOVER_FORM	t	Handover acceptance form	1	t	2026-06-25 08:43:12.241
\.


--
-- Data for Name: FitoutMilestone; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutMilestone" (id, "projectId", stage, "startedAt", "completedAt", "targetDate", "slaDays", "isOverdue", "escalatedAt", notes) FROM stdin;
\.


--
-- Data for Name: FitoutProject; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutProject" (id, "contractId", "tenantId", "unitId", status, "handoverDate", "startDate", "expectedOpenDate", "actualOpenDate", "operationManagerId", notes, "createdAt", "updatedAt") FROM stdin;
cmqt98e7s00atwkh5cx14ptrn	cmqt98drh009zwkh5l5nji1v1	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	OPENED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	2024-04-15 00:00:00	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:58.167	2026-06-25 08:42:58.167
cmqt98eft00b9wkh5qstw367c	cmqt98dtn00a1wkh5b9uom5zz	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	OPENED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	2024-04-15 00:00:00	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:58.458	2026-06-25 08:42:58.458
cmqt98eov00bpwkh5tow8rn26	cmqt98dur00a3wkh5q5pw84sv	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	OPENED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	2024-04-15 00:00:00	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:58.783	2026-06-25 08:42:58.783
cmqt98ez400c5wkh59z4xyu1v	cmqt98dvn00a5wkh5hej394zc	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	OPENED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	2024-04-15 00:00:00	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:59.152	2026-06-25 08:42:59.152
cmqt98f6z00clwkh514t34vko	cmqt98dwe00a7wkh5hp7gogh6	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	APPROVED_TO_OPEN	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:59.435	2026-06-25 08:42:59.435
cmqt98ff900d1wkh56r0b419k	cmqt98dxk00a9wkh5t8otion2	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	INSPECTION	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:42:59.733	2026-06-25 08:42:59.733
cmqt98fph00dhwkh5u6250zqc	cmqt98dyp00abwkh5qn146x5y	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	FITOUT_IN_PROGRESS	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:00.101	2026-06-25 08:43:00.101
cmqt98fyp00dxwkh57o0eunvg	cmqt98dzn00adwkh54jj4vy7b	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	CONSTRUCTION_PERMIT	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:00.433	2026-06-25 08:43:00.433
cmqt98g6300edwkh5e1mkqz6n	cmqt98e0s00afwkh508v2zc4j	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	DESIGN_REVIEW	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:00.699	2026-06-25 08:43:00.699
cmqt98gf500etwkh5cg8n6swl	cmqt98e1q00ahwkh5jk14ngi6	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	SUBMIT_DESIGN	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:01.025	2026-06-25 08:43:01.025
cmqt98goe00f9wkh592utifez	cmqt98e2n00ajwkh5cputsdrs	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	CONTRACT_SIGNED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:01.359	2026-06-25 08:43:01.359
cmqt98h0f00fpwkh5fe7tvvuu	cmqt98e3l00alwkh58r7mogzv	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	CONTRACT_SIGNED	2024-01-15 00:00:00	2024-02-01 00:00:00	2024-04-01 00:00:00	\N	cmqt987si0006wkh56418hk6e	Fitout project in progress	2026-06-25 08:43:01.791	2026-06-25 08:43:01.791
\.


--
-- Data for Name: FitoutSlaPolicy; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FitoutSlaPolicy" (id, stage, "targetDays", "warningDays", "escalateToRole", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98p3m00tcwkh5ux9pkadd	CONTRACT_SIGNED	7	5	LEASING_MANAGER	t	2026-06-25 08:43:12.275	2026-06-25 08:43:12.275
cmqt98p4s00tdwkh56d05vn3r	SUBMIT_DESIGN	14	10	LEASING_MANAGER	t	2026-06-25 08:43:12.316	2026-06-25 08:43:12.316
cmqt98p5q00tewkh5xqw2r82m	DESIGN_REVIEW	7	5	OPERATION	t	2026-06-25 08:43:12.35	2026-06-25 08:43:12.35
cmqt98p6w00tfwkh5s5g49d09	FIRE_SAFETY_REVIEW	14	10	OPERATION	t	2026-06-25 08:43:12.392	2026-06-25 08:43:12.392
cmqt98p8000tgwkh5cyg59rus	CONSTRUCTION_PERMIT	7	5	OPERATION	t	2026-06-25 08:43:12.432	2026-06-25 08:43:12.432
cmqt98p8y00thwkh5qa8mg042	FITOUT_IN_PROGRESS	60	45	MALL_DIRECTOR	t	2026-06-25 08:43:12.466	2026-06-25 08:43:12.466
cmqt98p9u00tiwkh5t4b3v1mn	INSPECTION	7	5	OPERATION	t	2026-06-25 08:43:12.499	2026-06-25 08:43:12.499
cmqt98pat00tjwkh5noq081wz	APPROVED_TO_OPEN	3	2	MALL_DIRECTOR	t	2026-06-25 08:43:12.534	2026-06-25 08:43:12.534
\.


--
-- Data for Name: Floor; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Floor" (id, "mallId", "buildingId", name, level, "sortOrder", "isActive", "createdAt", "updatedAt", "floorPlanUrl", "floorPlanRatio") FROM stdin;
cmqt9885u0011wkh5dzy8mesq	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	Ground Floor	GF	0	t	2026-06-25 08:42:50.32	2026-06-25 08:42:50.32	\N	\N
cmqt9888q0013wkh56x4oqj5q	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	Level 2	L2	2	t	2026-06-25 08:42:50.321	2026-06-25 08:42:50.321	\N	\N
cmqt9889b0016wkh58yqnkudx	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	Level 1	L1	1	t	2026-06-25 08:42:50.32	2026-06-25 08:42:50.32	\N	\N
cmqt9889d0019wkh5h6hsmpa0	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	Level 4	L4	4	t	2026-06-25 08:42:50.322	2026-06-25 08:42:50.322	\N	\N
cmqt9889b0017wkh5odhu6594	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	Level 3	L3	3	t	2026-06-25 08:42:50.322	2026-06-25 08:42:50.322	\N	\N
\.


--
-- Data for Name: FloorPlanAnalysis; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."FloorPlanAnalysis" (id, "mallId", "fileName", "filePath", "fileType", "fileSizeKb", version, status, analysis, suggestions, "appliedAt", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Invoice; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Invoice" (id, "invoiceNumber", "contractId", "tenantId", period, type, status, subtotal, "vatRate", "vatAmount", "totalAmount", "dueDate", "issuedAt", "paidAt", notes, "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98h8z00g5wkh56hc9cs80	INV-2026-03-0001	cmqt98drh009zwkh5l5nji1v1	cmqt989zj003swkh596wgouii	2026-03	MONTHLY_RENT	PAID	135000000	10	13500000	148500000	2026-03-15 00:00:00	2026-03-01 00:00:00	2026-03-10 00:00:00	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.099	2026-06-25 08:43:02.099
cmqt98hep00gdwkh5ipwwupqd	INV-2026-03-0002	cmqt98dtn00a1wkh5b9uom5zz	cmqt989zj003twkh5hxztnsx4	2026-03	MONTHLY_RENT	PAID	175500000	10	17550000	193050000	2026-03-15 00:00:00	2026-03-01 00:00:00	2026-03-10 00:00:00	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.305	2026-06-25 08:43:02.305
cmqt98hk800glwkh5o4pm35n4	INV-2026-03-0003	cmqt98dur00a3wkh5q5pw84sv	cmqt98a1t003ywkh5v11or50n	2026-03	MONTHLY_RENT	PAID	78400000	10	7840000	86240000	2026-03-15 00:00:00	2026-03-01 00:00:00	2026-03-10 00:00:00	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.505	2026-06-25 08:43:02.505
cmqt98hpj00gtwkh5ntx8xdyo	INV-2026-03-0004	cmqt98dvn00a5wkh5hej394zc	cmqt989zk003uwkh58qv3to2h	2026-03	MONTHLY_RENT	ISSUED	181800000	10	18180000	199980000	2026-03-15 00:00:00	2026-03-01 00:00:00	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.696	2026-06-25 08:43:02.696
cmqt98hsj00gzwkh55i8h04je	INV-2026-03-0005	cmqt98dwe00a7wkh5hp7gogh6	cmqt989zk003vwkh5vfomnbpr	2026-03	MONTHLY_RENT	ISSUED	256500000	10	25650000	282150000	2026-03-15 00:00:00	2026-03-01 00:00:00	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.803	2026-06-25 08:43:02.803
cmqt98hx700h5wkh5zv7u8fg3	INV-2026-03-0006	cmqt98dxk00a9wkh5t8otion2	cmqt98a1h003wwkh5lm7lw5bk	2026-03	MONTHLY_RENT	OVERDUE	227250000	10	22725000	249975000	2026-03-15 00:00:00	2026-03-01 00:00:00	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:02.972	2026-06-25 08:43:02.972
cmqt98i0y00hbwkh58prpqyj5	INV-2026-03-0007	cmqt98dyp00abwkh5qn146x5y	cmqt98a1s003xwkh5rj5zagap	2026-03	MONTHLY_RENT	OVERDUE	180800000	10	18080000	198880000	2026-03-15 00:00:00	2026-03-01 00:00:00	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:03.106	2026-06-25 08:43:03.106
cmqt98i4f00hhwkh5v229cejr	INV-2026-03-0008	cmqt98dzn00adwkh54jj4vy7b	cmqt989zi003rwkh54nluj9gq	2026-03	MONTHLY_RENT	PARTIALLY_PAID	226000000	10	22600000	248600000	2026-03-15 00:00:00	2026-03-01 00:00:00	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:03.231	2026-06-25 08:43:03.231
cmqt98i9600hpwkh5dcs5juf2	INV-2026-03-0009	cmqt98e0s00afwkh508v2zc4j	cmqt98a1w003zwkh5bqbehrbe	2026-03	MONTHLY_RENT	DRAFT	121500000	10	12150000	133650000	2026-03-15 00:00:00	\N	\N	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:03.402	2026-06-25 08:43:03.402
cmqt98idl00hvwkh5hikjrjdl	INV-2026-03-0010	cmqt98e1q00ahwkh5jk14ngi6	cmqt98a1x0040wkh5lyyd6rdx	2026-03	MONTHLY_RENT	PAID	145800000	10	14580000	160380000	2026-03-15 00:00:00	2026-03-01 00:00:00	2026-03-10 00:00:00	Monthly rent invoice for 2026-03	t	2026-06-25 08:43:03.561	2026-06-25 08:43:03.561
cmqt98iht00i3wkh5sf5wg11a	INV-2026-04-0011	cmqt98drh009zwkh5l5nji1v1	cmqt989zj003swkh596wgouii	2026-04	MONTHLY_RENT	PAID	135000000	10	13500000	148500000	2026-04-15 00:00:00	2026-04-01 00:00:00	2026-04-10 00:00:00	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:03.713	2026-06-25 08:43:03.713
cmqt98ilq00ibwkh5b18igdpr	INV-2026-04-0012	cmqt98dtn00a1wkh5b9uom5zz	cmqt989zj003twkh5hxztnsx4	2026-04	MONTHLY_RENT	PAID	175500000	10	17550000	193050000	2026-04-15 00:00:00	2026-04-01 00:00:00	2026-04-10 00:00:00	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:03.854	2026-06-25 08:43:03.854
cmqt98ipm00ijwkh5zteqacmu	INV-2026-04-0013	cmqt98dur00a3wkh5q5pw84sv	cmqt98a1t003ywkh5v11or50n	2026-04	MONTHLY_RENT	PAID	78400000	10	7840000	86240000	2026-04-15 00:00:00	2026-04-01 00:00:00	2026-04-10 00:00:00	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:03.995	2026-06-25 08:43:03.995
cmqt98itu00irwkh5588a5q9j	INV-2026-04-0014	cmqt98dvn00a5wkh5hej394zc	cmqt989zk003uwkh58qv3to2h	2026-04	MONTHLY_RENT	ISSUED	181800000	10	18180000	199980000	2026-04-15 00:00:00	2026-04-01 00:00:00	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.147	2026-06-25 08:43:04.147
cmqt98iwv00ixwkh5zgtq6j8n	INV-2026-04-0015	cmqt98dwe00a7wkh5hp7gogh6	cmqt989zk003vwkh5vfomnbpr	2026-04	MONTHLY_RENT	ISSUED	256500000	10	25650000	282150000	2026-04-15 00:00:00	2026-04-01 00:00:00	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.255	2026-06-25 08:43:04.255
cmqt98izv00j3wkh5gezmpcy3	INV-2026-04-0016	cmqt98dxk00a9wkh5t8otion2	cmqt98a1h003wwkh5lm7lw5bk	2026-04	MONTHLY_RENT	OVERDUE	227250000	10	22725000	249975000	2026-04-15 00:00:00	2026-04-01 00:00:00	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.363	2026-06-25 08:43:04.363
cmqt98j2u00j9wkh52jjqgc5q	INV-2026-04-0017	cmqt98dyp00abwkh5qn146x5y	cmqt98a1s003xwkh5rj5zagap	2026-04	MONTHLY_RENT	OVERDUE	180800000	10	18080000	198880000	2026-04-15 00:00:00	2026-04-01 00:00:00	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.471	2026-06-25 08:43:04.471
cmqt98j5z00jfwkh5s4pnb9pt	INV-2026-04-0018	cmqt98dzn00adwkh54jj4vy7b	cmqt989zi003rwkh54nluj9gq	2026-04	MONTHLY_RENT	PARTIALLY_PAID	226000000	10	22600000	248600000	2026-04-15 00:00:00	2026-04-01 00:00:00	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.583	2026-06-25 08:43:04.583
cmqt98jbf00jnwkh5w2wu8iml	INV-2026-04-0019	cmqt98e0s00afwkh508v2zc4j	cmqt98a1w003zwkh5bqbehrbe	2026-04	MONTHLY_RENT	DRAFT	121500000	10	12150000	133650000	2026-04-15 00:00:00	\N	\N	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.78	2026-06-25 08:43:04.78
cmqt98jf300jtwkh5s99nu0pi	INV-2026-04-0020	cmqt98e1q00ahwkh5jk14ngi6	cmqt98a1x0040wkh5lyyd6rdx	2026-04	MONTHLY_RENT	PAID	145800000	10	14580000	160380000	2026-04-15 00:00:00	2026-04-01 00:00:00	2026-04-10 00:00:00	Monthly rent invoice for 2026-04	t	2026-06-25 08:43:04.911	2026-06-25 08:43:04.911
cmqt98jkm00k1wkh5npi50rw3	INV-2026-05-0021	cmqt98drh009zwkh5l5nji1v1	cmqt989zj003swkh596wgouii	2026-05	MONTHLY_RENT	PAID	135000000	10	13500000	148500000	2026-05-15 00:00:00	2026-05-01 00:00:00	2026-05-10 00:00:00	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.11	2026-06-25 08:43:05.11
cmqt98jom00k9wkh59w26wibc	INV-2026-05-0022	cmqt98dtn00a1wkh5b9uom5zz	cmqt989zj003twkh5hxztnsx4	2026-05	MONTHLY_RENT	PAID	175500000	10	17550000	193050000	2026-05-15 00:00:00	2026-05-01 00:00:00	2026-05-10 00:00:00	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.254	2026-06-25 08:43:05.254
cmqt98jtl00khwkh5wbs91nwh	INV-2026-05-0023	cmqt98dur00a3wkh5q5pw84sv	cmqt98a1t003ywkh5v11or50n	2026-05	MONTHLY_RENT	PAID	78400000	10	7840000	86240000	2026-05-15 00:00:00	2026-05-01 00:00:00	2026-05-10 00:00:00	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.433	2026-06-25 08:43:05.433
cmqt98jxq00kpwkh5w0993kxy	INV-2026-05-0024	cmqt98dvn00a5wkh5hej394zc	cmqt989zk003uwkh58qv3to2h	2026-05	MONTHLY_RENT	ISSUED	181800000	10	18180000	199980000	2026-05-15 00:00:00	2026-05-01 00:00:00	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.582	2026-06-25 08:43:05.582
cmqt98k0r00kvwkh55a2uo9qv	INV-2026-05-0025	cmqt98dwe00a7wkh5hp7gogh6	cmqt989zk003vwkh5vfomnbpr	2026-05	MONTHLY_RENT	ISSUED	256500000	10	25650000	282150000	2026-05-15 00:00:00	2026-05-01 00:00:00	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.691	2026-06-25 08:43:05.691
cmqt98k5b00l1wkh5xwodu39c	INV-2026-05-0026	cmqt98dxk00a9wkh5t8otion2	cmqt98a1h003wwkh5lm7lw5bk	2026-05	MONTHLY_RENT	OVERDUE	227250000	10	22725000	249975000	2026-05-15 00:00:00	2026-05-01 00:00:00	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:05.856	2026-06-25 08:43:05.856
cmqt98k9g00l7wkh50q8nzz6e	INV-2026-05-0027	cmqt98dyp00abwkh5qn146x5y	cmqt98a1s003xwkh5rj5zagap	2026-05	MONTHLY_RENT	OVERDUE	180800000	10	18080000	198880000	2026-05-15 00:00:00	2026-05-01 00:00:00	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:06.004	2026-06-25 08:43:06.004
cmqt98kdm00ldwkh50e60cr7r	INV-2026-05-0028	cmqt98dzn00adwkh54jj4vy7b	cmqt989zi003rwkh54nluj9gq	2026-05	MONTHLY_RENT	PARTIALLY_PAID	226000000	10	22600000	248600000	2026-05-15 00:00:00	2026-05-01 00:00:00	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:06.154	2026-06-25 08:43:06.154
cmqt98khv00llwkh5rpvpejyc	INV-2026-05-0029	cmqt98e0s00afwkh508v2zc4j	cmqt98a1w003zwkh5bqbehrbe	2026-05	MONTHLY_RENT	DRAFT	121500000	10	12150000	133650000	2026-05-15 00:00:00	\N	\N	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:06.307	2026-06-25 08:43:06.307
cmqt98klb00lrwkh5z1xmnc2i	INV-2026-05-0030	cmqt98e1q00ahwkh5jk14ngi6	cmqt98a1x0040wkh5lyyd6rdx	2026-05	MONTHLY_RENT	PAID	145800000	10	14580000	160380000	2026-05-15 00:00:00	2026-05-01 00:00:00	2026-05-10 00:00:00	Monthly rent invoice for 2026-05	t	2026-06-25 08:43:06.431	2026-06-25 08:43:06.431
\.


--
-- Data for Name: InvoiceLine; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."InvoiceLine" (id, "invoiceId", type, description, qty, "unitPrice", amount, "order") FROM stdin;
cmqt98ha500g7wkh5sm73q68a	cmqt98h8z00g5wkh56hc9cs80	RENT	Base rent - 2026-03 - Unit GF-A01	1	120000000	120000000	0
cmqt98hch00g9wkh5w33a7q23	cmqt98h8z00g5wkh56hc9cs80	CAM	CAM charge - 2026-03 - Unit GF-A01	1	15000000	15000000	1
cmqt98hfp00gfwkh5lg9usa43	cmqt98hep00gdwkh5ipwwupqd	RENT	Base rent - 2026-03 - Unit GF-A02	1	156000000	156000000	0
cmqt98hgn00ghwkh5m07pgn91	cmqt98hep00gdwkh5ipwwupqd	CAM	CAM charge - 2026-03 - Unit GF-A02	1	19500000	19500000	1
cmqt98hm600gnwkh5riqnajxz	cmqt98hk800glwkh5o4pm35n4	RENT	Base rent - 2026-03 - Unit GF-B01	1	70000000	70000000	0
cmqt98hnk00gpwkh5qo22bb1a	cmqt98hk800glwkh5o4pm35n4	CAM	CAM charge - 2026-03 - Unit GF-B01	1	8400000	8400000	1
cmqt98hqk00gvwkh5eplivoap	cmqt98hpj00gtwkh5ntx8xdyo	RENT	Base rent - 2026-03 - Unit GF-B02	1	162000000	162000000	0
cmqt98hrh00gxwkh53ujfdec9	cmqt98hpj00gtwkh5ntx8xdyo	CAM	CAM charge - 2026-03 - Unit GF-B02	1	19800000	19800000	1
cmqt98htm00h1wkh5p8oy0tzh	cmqt98hsj00gzwkh55i8h04je	RENT	Base rent - 2026-03 - Unit GF-C01	1	229500000	229500000	0
cmqt98hvx00h3wkh53wj7nf15	cmqt98hsj00gzwkh55i8h04je	CAM	CAM charge - 2026-03 - Unit GF-C01	1	27000000	27000000	1
cmqt98hy800h7wkh51lmqiwec	cmqt98hx700h5wkh5zv7u8fg3	RENT	Base rent - 2026-03 - Unit GF-C02	1	202500000	202500000	0
cmqt98hzd00h9wkh5gcsjke38	cmqt98hx700h5wkh5zv7u8fg3	CAM	CAM charge - 2026-03 - Unit GF-C02	1	24750000	24750000	1
cmqt98i1x00hdwkh5uh73rsfz	cmqt98i0y00hbwkh58prpqyj5	RENT	Base rent - 2026-03 - Unit L1-A01	1	160000000	160000000	0
cmqt98i2w00hfwkh5h94n7mvx	cmqt98i0y00hbwkh58prpqyj5	CAM	CAM charge - 2026-03 - Unit L1-A01	1	20800000	20800000	1
cmqt98i5h00hjwkh5k8bkl6iv	cmqt98i4f00hhwkh5v229cejr	RENT	Base rent - 2026-03 - Unit L1-A02	1	200000000	200000000	0
cmqt98i6m00hlwkh5mx207ghw	cmqt98i4f00hhwkh5v229cejr	CAM	CAM charge - 2026-03 - Unit L1-A02	1	26000000	26000000	1
cmqt98iaa00hrwkh5lz9xp015	cmqt98i9600hpwkh5dcs5juf2	RENT	Base rent - 2026-03 - Unit L1-B01	1	108000000	108000000	0
cmqt98ib600htwkh551bbhmjs	cmqt98i9600hpwkh5dcs5juf2	CAM	CAM charge - 2026-03 - Unit L1-B01	1	13500000	13500000	1
cmqt98ieo00hxwkh5vzw6u7aa	cmqt98idl00hvwkh5hikjrjdl	RENT	Base rent - 2026-03 - Unit L1-B02	1	129600000	129600000	0
cmqt98ifl00hzwkh5zft98u3f	cmqt98idl00hvwkh5hikjrjdl	CAM	CAM charge - 2026-03 - Unit L1-B02	1	16200000	16200000	1
cmqt98iit00i5wkh50b1nboz9	cmqt98iht00i3wkh5sf5wg11a	RENT	Base rent - 2026-04 - Unit GF-A01	1	120000000	120000000	0
cmqt98ijq00i7wkh5ac1h3qm3	cmqt98iht00i3wkh5sf5wg11a	CAM	CAM charge - 2026-04 - Unit GF-A01	1	15000000	15000000	1
cmqt98imr00idwkh59tw0jw08	cmqt98ilq00ibwkh5b18igdpr	RENT	Base rent - 2026-04 - Unit GF-A02	1	156000000	156000000	0
cmqt98ino00ifwkh55c5o6mda	cmqt98ilq00ibwkh5b18igdpr	CAM	CAM charge - 2026-04 - Unit GF-A02	1	19500000	19500000	1
cmqt98iqo00ilwkh5ymcbfawh	cmqt98ipm00ijwkh5zteqacmu	RENT	Base rent - 2026-04 - Unit GF-B01	1	70000000	70000000	0
cmqt98irm00inwkh5l1zr6psh	cmqt98ipm00ijwkh5zteqacmu	CAM	CAM charge - 2026-04 - Unit GF-B01	1	8400000	8400000	1
cmqt98iuv00itwkh5fwylzumv	cmqt98itu00irwkh5588a5q9j	RENT	Base rent - 2026-04 - Unit GF-B02	1	162000000	162000000	0
cmqt98ivt00ivwkh5dysc2yqa	cmqt98itu00irwkh5588a5q9j	CAM	CAM charge - 2026-04 - Unit GF-B02	1	19800000	19800000	1
cmqt98ixw00izwkh5g060dcov	cmqt98iwv00ixwkh5zgtq6j8n	RENT	Base rent - 2026-04 - Unit GF-C01	1	229500000	229500000	0
cmqt98iyt00j1wkh5rcmzrxnj	cmqt98iwv00ixwkh5zgtq6j8n	CAM	CAM charge - 2026-04 - Unit GF-C01	1	27000000	27000000	1
cmqt98j0w00j5wkh5l1za1d18	cmqt98izv00j3wkh5gezmpcy3	RENT	Base rent - 2026-04 - Unit GF-C02	1	202500000	202500000	0
cmqt98j1u00j7wkh56cmk2gp8	cmqt98izv00j3wkh5gezmpcy3	CAM	CAM charge - 2026-04 - Unit GF-C02	1	24750000	24750000	1
cmqt98j3x00jbwkh5st145n3u	cmqt98j2u00j9wkh52jjqgc5q	RENT	Base rent - 2026-04 - Unit L1-A01	1	160000000	160000000	0
cmqt98j4t00jdwkh5dkw4k2xa	cmqt98j2u00j9wkh52jjqgc5q	CAM	CAM charge - 2026-04 - Unit L1-A01	1	20800000	20800000	1
cmqt98j6w00jhwkh5syevc59v	cmqt98j5z00jfwkh5s4pnb9pt	RENT	Base rent - 2026-04 - Unit L1-A02	1	200000000	200000000	0
cmqt98j9a00jjwkh5b6achemp	cmqt98j5z00jfwkh5s4pnb9pt	CAM	CAM charge - 2026-04 - Unit L1-A02	1	26000000	26000000	1
cmqt98jci00jpwkh5iseebkix	cmqt98jbf00jnwkh5w2wu8iml	RENT	Base rent - 2026-04 - Unit L1-B01	1	108000000	108000000	0
cmqt98jdo00jrwkh5o3d5tuas	cmqt98jbf00jnwkh5w2wu8iml	CAM	CAM charge - 2026-04 - Unit L1-B01	1	13500000	13500000	1
cmqt98jhj00jvwkh5kdcdspf3	cmqt98jf300jtwkh5s99nu0pi	RENT	Base rent - 2026-04 - Unit L1-B02	1	129600000	129600000	0
cmqt98jig00jxwkh542hlep13	cmqt98jf300jtwkh5s99nu0pi	CAM	CAM charge - 2026-04 - Unit L1-B02	1	16200000	16200000	1
cmqt98jlp00k3wkh5rbyqxvio	cmqt98jkm00k1wkh5npi50rw3	RENT	Base rent - 2026-05 - Unit GF-A01	1	120000000	120000000	0
cmqt98jmm00k5wkh5z33oynzx	cmqt98jkm00k1wkh5npi50rw3	CAM	CAM charge - 2026-05 - Unit GF-A01	1	15000000	15000000	1
cmqt98jpq00kbwkh5wipg26hh	cmqt98jom00k9wkh59w26wibc	RENT	Base rent - 2026-05 - Unit GF-A02	1	156000000	156000000	0
cmqt98jqv00kdwkh5sgvm7gcy	cmqt98jom00k9wkh59w26wibc	CAM	CAM charge - 2026-05 - Unit GF-A02	1	19500000	19500000	1
cmqt98jur00kjwkh5gcylpocq	cmqt98jtl00khwkh5wbs91nwh	RENT	Base rent - 2026-05 - Unit GF-B01	1	70000000	70000000	0
cmqt98jvo00klwkh5lcrobqhr	cmqt98jtl00khwkh5wbs91nwh	CAM	CAM charge - 2026-05 - Unit GF-B01	1	8400000	8400000	1
cmqt98jyp00krwkh572fhpnf4	cmqt98jxq00kpwkh5w0993kxy	RENT	Base rent - 2026-05 - Unit GF-B02	1	162000000	162000000	0
cmqt98jzm00ktwkh5bjgo1u58	cmqt98jxq00kpwkh5w0993kxy	CAM	CAM charge - 2026-05 - Unit GF-B02	1	19800000	19800000	1
cmqt98k3300kxwkh5ccwxof5n	cmqt98k0r00kvwkh55a2uo9qv	RENT	Base rent - 2026-05 - Unit GF-C01	1	229500000	229500000	0
cmqt98k4800kzwkh5a0ou64zp	cmqt98k0r00kvwkh55a2uo9qv	CAM	CAM charge - 2026-05 - Unit GF-C01	1	27000000	27000000	1
cmqt98k6b00l3wkh58ohywu8p	cmqt98k5b00l1wkh5xwodu39c	RENT	Base rent - 2026-05 - Unit GF-C02	1	202500000	202500000	0
cmqt98k7800l5wkh511ze7ar0	cmqt98k5b00l1wkh5xwodu39c	CAM	CAM charge - 2026-05 - Unit GF-C02	1	24750000	24750000	1
cmqt98kah00l9wkh50vlx2u1y	cmqt98k9g00l7wkh50q8nzz6e	RENT	Base rent - 2026-05 - Unit L1-A01	1	160000000	160000000	0
cmqt98kcj00lbwkh5guibn4ie	cmqt98k9g00l7wkh50q8nzz6e	CAM	CAM charge - 2026-05 - Unit L1-A01	1	20800000	20800000	1
cmqt98kem00lfwkh5sbf8v35b	cmqt98kdm00ldwkh50e60cr7r	RENT	Base rent - 2026-05 - Unit L1-A02	1	200000000	200000000	0
cmqt98kfk00lhwkh54v3nkhyw	cmqt98kdm00ldwkh50e60cr7r	CAM	CAM charge - 2026-05 - Unit L1-A02	1	26000000	26000000	1
cmqt98kj700lnwkh5mbck2q92	cmqt98khv00llwkh5rpvpejyc	RENT	Base rent - 2026-05 - Unit L1-B01	1	108000000	108000000	0
cmqt98kk800lpwkh5vg3hhyg4	cmqt98khv00llwkh5rpvpejyc	CAM	CAM charge - 2026-05 - Unit L1-B01	1	13500000	13500000	1
cmqt98kmb00ltwkh5lsj0ti02	cmqt98klb00lrwkh5z1xmnc2i	RENT	Base rent - 2026-05 - Unit L1-B02	1	129600000	129600000	0
cmqt98kn800lvwkh5sf5128jr	cmqt98klb00lrwkh5z1xmnc2i	CAM	CAM charge - 2026-05 - Unit L1-B02	1	16200000	16200000	1
\.


--
-- Data for Name: Lead; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Lead" (id, "brandName", company, "contactName", phone, email, category, "categoryId", source, status, priority, "assignedToId", "tenantId", "customerId", notes, "expectedRent", "expectedArea", "estimatedValue", "expectedCloseDate", "preferredCategory", "position", "lastActivityAt", "lostReason", "isActive", "deletedAt", "createdAt", "updatedAt") FROM stdin;
cmqt98bf1006kwkh5ppp3zvue	Starbucks	Starbucks Vietnam	Sarah Johnson	0291234569	sarah@starbucks.com.vn	F&B	\N	REFERRAL	QUALIFIED	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	cmqt98a440049wkh5pysvmwcd	\N	1100000	150	165000000	2026-08-09 08:42:54.348	\N	0	2026-06-23 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.541	2026-06-25 08:42:54.541
cmqt98blj006uwkh5m8wswsmp	Pizza Hut	Pizza Hut Vietnam	David Lee	0291234571	david@pizzahut.com.vn	F&B	\N	WALK_IN	NEW	WARM	cmqt987mh0001wkh5n3v0w9tq	\N	cmqt98a44004awkh5x2v5hz43	\N	850000	180	153000000	2026-09-08 08:42:54.348	\N	0	2026-06-21 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.775	2026-06-25 08:42:54.775
cmqt98bnl006ywkh5g6m8p7w5	Watsons	AS Watson Vietnam	Michelle Tan	0291234572	michelle@watsons.com.vn	Health & Beauty	\N	BROKER	NEGOTIATION	WARM	cmqt987ne0002wkh5jxwbedq2	\N	cmqt98a45004cwkh586rwbwtn	\N	850000	200	170000000	2026-07-10 08:42:54.348	\N	1	2026-06-20 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.849	2026-06-25 08:42:54.849
cmqt98bvb0078wkh5njlmqkcf	Butter Me Up	BMU Vietnam	Phan Thu Ha	0291234574	ha@buttermeup.vn	F&B	\N	WALK_IN	LOST	COLD	cmqt987ne0002wkh5jxwbedq2	\N	cmqt98a48004fwkh5cihp2jcx	\N	900000	80	72000000	\N	\N	0	2026-06-18 08:42:54.348	Budget constraints - found cheaper alternative	t	\N	2026-06-25 08:42:55.126	2026-06-25 08:42:55.126
cmqt98bxl007cwkh5kenzrut9	CellphoneS	CellphoneS JSC	Tran Minh Quan	0291234575	quan@cellphones.com.vn	Technology	\N	REFERRAL	QUALIFIED	WARM	cmqt987mh0001wkh5n3v0w9tq	\N	cmqt98a4n004iwkh5wtayg8h8	\N	750000	120	90000000	2026-08-24 08:42:54.348	\N	1	2026-06-17 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.208	2026-06-25 08:42:55.208
cmqt98c2n007mwkh5lcwrrxq0	ALDO	ALDO Vietnam	Michel Leblanc	0291234577	michel@aldo.com.vn	Fashion	\N	WEBSITE	NEW	COLD	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	800000	100	80000000	2026-07-10 08:42:54.348	\N	1	2026-06-25 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.391	2026-06-25 08:42:55.391
cmqt98c4y007qwkh5nv9atldq	Gym Master	Gym Master Vietnam	Vo Thanh Long	0291234578	long@gymmaster.vn	Entertainment	\N	WALK_IN	CONTACTED	WARM	cmqt987ne0002wkh5jxwbedq2	\N	\N	\N	600000	500	300000000	2026-07-25 08:42:54.348	\N	1	2026-06-24 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.474	2026-06-25 08:42:55.474
cmqt98c6u007uwkh58bg59z3j	Paris Baguette	SPC Vietnam	Park Jin Soo	0291234579	jinsoo@parisbaguette.vn	F&B	\N	BROKER	NEGOTIATION	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	1000000	130	130000000	2026-08-09 08:42:54.348	\N	2	2026-06-23 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.542	2026-06-25 08:42:55.542
cmqt98cba0080wkh5qnupi10l	Miniso	Miniso Vietnam	Zhang Wei	0291234580	zhang@miniso.com.vn	Fashion	\N	WEBSITE	QUALIFIED	COLD	cmqt987ne0002wkh5jxwbedq2	\N	\N	\N	700000	200	140000000	2026-08-24 08:42:54.348	\N	2	2026-06-22 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.702	2026-06-25 08:42:55.702
cmqt98cda0084wkh58q003wb2	Baskin Robbins	Baskin Robbins Vietnam	Tom Anderson	0291234581	tom@baskinrobbins.com.vn	F&B	\N	REFERRAL	CONTACTED	COLD	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	850000	60	51000000	2026-09-08 08:42:54.348	\N	2	2026-06-21 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.775	2026-06-25 08:42:55.775
cmqt98cf60088wkh5pdryjyrb	Sephora	LVMH Beauty Vietnam	Isabelle Martin	0291234582	isabelle@sephora.com.vn	Health & Beauty	\N	BROKER	PROPOSAL	HOT	cmqt987ne0002wkh5jxwbedq2	\N	\N	\N	950000	250	237500000	2026-07-10 08:42:54.348	\N	2	2026-06-20 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.842	2026-06-25 08:42:55.842
cmqt98cjj008ewkh5qek4op86	CGV Cinemas	CJ CGV Vietnam	Kim Dong Hyun	0291234583	donghyun@cgv.vn	Entertainment	\N	BROKER	NEGOTIATION	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	450000	2000	900000000	2026-07-25 08:42:54.348	\N	3	2026-06-19 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.999	2026-06-25 08:42:55.999
cmqt98clm008iwkh5e88la642	Tous Les Jours	CJ Foodville Vietnam	Park Soo Yeon	0291234584	sooyeon@tousslesjours.vn	F&B	\N	WALK_IN	NEW	WARM	cmqt987ne0002wkh5jxwbedq2	\N	\N	\N	900000	100	90000000	2026-08-09 08:42:54.348	\N	2	2026-06-18 08:42:54.348	\N	t	\N	2026-06-25 08:42:56.074	2026-06-25 08:42:56.074
cmqt98co0008mwkh5z8jmgqwp	Nike Vietnam	Blue Lagoon Vietnam	Jason Miller	0291234585	jason@nike.com.vn	Fashion	\N	WEBSITE	LOST	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	\N	\N	850000	300	255000000	\N	\N	1	2026-06-17 08:42:54.348	Chose another location - AEON Mall	t	\N	2026-06-25 08:42:56.159	2026-06-25 08:42:56.159
cmqt98cr6008swkh5h17iu6ct	Aeon MaxValu	Aeon Vietnam	Yamamoto Kenji	0291234586	kenji@aeon.com.vn	Supermarket	\N	BROKER	QUALIFIED	HOT	cmqt987ne0002wkh5jxwbedq2	\N	\N	\N	350000	3000	1050000000	2026-09-08 08:42:54.348	\N	3	2026-06-16 08:42:54.348	\N	t	\N	2026-06-25 08:42:56.274	2026-06-25 08:42:56.274
cmqt98bhc006owkh5xlr6kob6	H&M Vietnam	H&M Vietnam Co.	Erik Svensson	0291234570	erik@hm.com.vn	Fashion	\N	WEBSITE	CONTACTED	WARM	cmqt987ne0002wkh5jxwbedq2	\N	cmqt98a47004ewkh5lh79fbsw	\N	750000	400	300000000	2026-08-24 08:42:54.348	\N	1	2026-06-22 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.625	2026-06-25 09:08:35.638
cmqt98b9q006awkh5o6khpcgl	KFC Vietnam	KFC Vietnam Co., Ltd	Robert Brown	0291234567	robert@kfc.com.vn	F&B	\N	BROKER	WON	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	cmqt98a45004bwkh5sz50av0f	\N	900000	200	180000000	2026-07-10 08:42:54.348	\N	0	2026-06-25 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.35	2026-06-25 09:14:57.272
cmqt98bs80072wkh5vo1qjbsl	Vincom Retail	Vincom Retail JSC	Nguyen Van Binh	0291234573	binh@vincom.vn	Entertainment	\N	EXISTING_TENANT	WON	HOT	cmqt987mh0001wkh5n3v0w9tq	\N	cmqt98a49004gwkh5gyn1zj9f	\N	500000	1000	500000000	\N	\N	1	2026-06-19 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.016	2026-06-25 09:15:01.225
cmr0b47ik000113z1tmb7ha5k	coffee 1	\N	A	0328921550	viinformationtechnology@gmail.com	Coffee & Tea	\N	REFERRAL	NEW	WARM	cmqt987us0008wkh5bmcyunai	\N	\N	xxx	\N	200	\N	\N	\N	0	\N	\N	t	\N	2026-06-30 07:10:05.324	2026-06-30 07:10:05.324
cmqt98bcy006gwkh5s495aeeo	Zara Vietnam	Inditex Vietnam	Carlos Rodriguez	0291234568	carlos@zara.com.vn	Fashion	\N	WEBSITE	NEGOTIATION	HOT	cmqt987ne0002wkh5jxwbedq2	\N	cmqt98a46004dwkh5dstb7fpk	\N	800000	300	240000000	2026-07-25 08:42:54.348	\N	0	2026-06-24 08:42:54.348	\N	t	\N	2026-06-25 08:42:54.466	2026-06-30 07:41:13.981
cmqt98bzu007gwkh5tx8b1zuu	Phuc Long Coffee	Phuc Long Heritage	Le Quoc Hung	0291234576	hung@phuclong.com.vn	F&B	\N	BROKER	WON	HOT	cmqt987ne0002wkh5jxwbedq2	\N	cmqt98a63004kwkh5vzonrqdr	\N	950000	160	152000000	2026-09-08 08:42:54.348	\N	1	2026-06-16 08:42:54.348	\N	t	\N	2026-06-25 08:42:55.29	2026-06-30 08:02:39.531
\.


--
-- Data for Name: LeadActivity; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."LeadActivity" (id, "leadId", type, note, "createdById", "createdAt") FROM stdin;
cmqt98bav006cwkh5st7yi45f	cmqt98b9q006awkh5o6khpcgl	CALL	Initial call with Robert Brown. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.391
cmqt98bc0006ewkh5s7fe41u7	cmqt98b9q006awkh5o6khpcgl	MEETING	Site visit conducted. Tenant interested in 200sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:54.432
cmqt98be3006iwkh5quevfv4w	cmqt98bcy006gwkh5s495aeeo	CALL	Initial call with Carlos Rodriguez. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.508
cmqt98bg7006mwkh5nv6y8ynd	cmqt98bf1006kwkh5ppp3zvue	CALL	Initial call with Sarah Johnson. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.583
cmqt98bjo006qwkh57jitkkfv	cmqt98bhc006owkh5xlr6kob6	CALL	Initial call with Erik Svensson. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.708
cmqt98bkl006swkh5vjxk32cx	cmqt98bhc006owkh5xlr6kob6	MEETING	Site visit conducted. Tenant interested in 400sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:54.741
cmqt98bmo006wwkh5t0cqji0g	cmqt98blj006uwkh5m8wswsmp	CALL	Initial call with David Lee. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.816
cmqt98br20070wkh5gb074hnw	cmqt98bnl006ywkh5g6m8p7w5	CALL	Initial call with Michelle Tan. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:54.974
cmqt98btd0074wkh5tlw4g1qf	cmqt98bs80072wkh5vo1qjbsl	CALL	Initial call with Nguyen Van Binh. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.057
cmqt98bu90076wkh5rgl3yamk	cmqt98bs80072wkh5vo1qjbsl	MEETING	Site visit conducted. Tenant interested in 1000sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:55.09
cmqt98bwf007awkh5o2p9eb64	cmqt98bvb0078wkh5njlmqkcf	CALL	Initial call with Phan Thu Ha. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.167
cmqt98byp007ewkh54j5hgs4q	cmqt98bxl007cwkh5kenzrut9	CALL	Initial call with Tran Minh Quan. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.249
cmqt98c0s007iwkh50qk3kgwd	cmqt98bzu007gwkh5tx8b1zuu	CALL	Initial call with Le Quoc Hung. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.324
cmqt98c1p007kwkh5gmutsz87	cmqt98bzu007gwkh5tx8b1zuu	MEETING	Site visit conducted. Tenant interested in 160sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:55.358
cmqt98c3t007owkh57eqmf7o3	cmqt98c2n007mwkh5lcwrrxq0	CALL	Initial call with Michel Leblanc. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.433
cmqt98c5w007swkh5pb2o6u08	cmqt98c4y007qwkh5nv9atldq	CALL	Initial call with Vo Thanh Long. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.508
cmqt98c9d007wwkh5thtb5787	cmqt98c6u007uwkh58bg59z3j	CALL	Initial call with Park Jin Soo. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.633
cmqt98caa007ywkh58zbf28qk	cmqt98c6u007uwkh58bg59z3j	MEETING	Site visit conducted. Tenant interested in 130sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:55.666
cmqt98ccd0082wkh5cx28ouak	cmqt98cba0080wkh5qnupi10l	CALL	Initial call with Zhang Wei. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.741
cmqt98ce70086wkh5swxnthzy	cmqt98cda0084wkh58q003wb2	CALL	Initial call with Tom Anderson. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.808
cmqt98cga008awkh5245bvs1w	cmqt98cf60088wkh5pdryjyrb	CALL	Initial call with Isabelle Martin. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:55.882
cmqt98cim008cwkh5j26yp3se	cmqt98cf60088wkh5pdryjyrb	MEETING	Site visit conducted. Tenant interested in 250sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:55.966
cmqt98ckh008gwkh5e59lqqyz	cmqt98cjj008ewkh5qek4op86	CALL	Initial call with Kim Dong Hyun. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.033
cmqt98cmu008kwkh5wnuyzfup	cmqt98clm008iwkh5e88la642	CALL	Initial call with Park Soo Yeon. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.118
cmqt98cp3008owkh54y8sep96	cmqt98co0008mwkh5z8jmgqwp	CALL	Initial call with Jason Miller. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.2
cmqt98cq8008qwkh5urkybza3	cmqt98co0008mwkh5z8jmgqwp	MEETING	Site visit conducted. Tenant interested in 300sqm on preferred floor.	cmqt987ne0002wkh5jxwbedq2	2026-06-25 08:42:56.24
cmqt98csb008uwkh53u1qxd34	cmqt98cr6008swkh5h17iu6ct	CALL	Initial call with Yamamoto Kenji. Discussed space requirements and rental terms.	cmqt987mh0001wkh5n3v0w9tq	2026-06-25 08:42:56.315
\.


--
-- Data for Name: LeadContact; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."LeadContact" (id, "leadId", name, title, email, phone, "isPrimary", "createdAt") FROM stdin;
\.


--
-- Data for Name: LeadFollowUp; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."LeadFollowUp" (id, "leadId", "customerId", "assignedToId", "dueDate", note, "isDone", "completedAt", "createdAt") FROM stdin;
cmqt98qna00v1wkh5uc2ve4z1	cmqt98b9q006awkh5o6khpcgl	\N	cmqt987mh0001wkh5n3v0w9tq	2026-06-28 08:43:14.277	Gọi điện xác nhận lịch xem mặt bằng	f	\N	2026-06-25 08:43:14.278
\.


--
-- Data for Name: MaintenanceSchedule; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."MaintenanceSchedule" (id, "mallId", "unitId", title, description, frequency, "nextDueDate", "lastExecutedAt", "assignedRole", "estimatedHours", "isActive", "createdById", "createdAt", "updatedAt") FROM stdin;
cmqt98qpk00v3wkh5l7of9dvk	cmqt9883d000xwkh5vdlw2qsa	\N	Kiểm tra hệ thống PCCC	Kiểm tra và bảo dưỡng hệ thống phòng cháy chữa cháy định kỳ	MONTHLY	2026-07-25 08:43:14.359	\N	OPERATION	\N	t	\N	2026-06-25 08:43:14.36	2026-06-25 08:43:14.36
\.


--
-- Data for Name: Mall; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Mall" (id, name, code, address, city, "totalArea", description, "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt9883d000xwkh5vdlw2qsa	THISO Mall Sala	THISO-SALA	10 Mai Chi Tho, An Phu Ward, Thu Duc City	Ho Chi Minh City	45000	A premium shopping mall in the heart of Sala urban area	t	2026-06-25 08:42:50.233	2026-06-25 08:42:50.233
\.


--
-- Data for Name: MallAnnouncement; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."MallAnnouncement" (id, "mallId", title, content, category, priority, "publishedAt", "expiresAt", "targetAll", "targetCategories", "attachmentUrl", "isActive", "createdById", "createdAt", "updatedAt") FROM stdin;
cmqt98qf300upwkh5szm8wrfb	cmqt9883d000xwkh5vdlw2qsa	Bảo trì hệ thống điện tầng B1	Kính thông báo: Hệ thống điện tầng B1 sẽ được bảo trì từ 22h-6h sáng ngày 20/06/2026. Quý khách thuê vui lòng chuẩn bị nguồn điện dự phòng.	MAINTENANCE	HIGH	2026-06-25 08:43:13.982	2026-07-02 08:43:13.982	t	\N	\N	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.983	2026-06-25 08:43:13.983
cmqt98qf300uqwkh5zmdwvnus	cmqt9883d000xwkh5vdlw2qsa	Khai trương khu vực ẩm thực tầng 3	Hân hạnh thông báo khu vực ẩm thực tầng 3 sẽ chính thức khai trương vào ngày 01/07/2026 với nhiều thương hiệu F&B mới.	EVENT	NORMAL	2026-06-25 08:43:13.982	\N	t	\N	\N	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.983	2026-06-25 08:43:13.983
cmqt98qf300urwkh5iewlst95	cmqt9883d000xwkh5vdlw2qsa	Cập nhật chính sách vệ sinh chung	Từ tháng 7/2026, tất cả khách thuê cần thực hiện phân loại rác theo đúng quy định mới của Mall. Chi tiết xem file đính kèm.	POLICY	NORMAL	2026-06-25 08:43:13.982	\N	t	\N	\N	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.983	2026-06-25 08:43:13.983
\.


--
-- Data for Name: MallPolicy; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."MallPolicy" (id, "mallId", policies, "kpiTargets", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98q4100u9wkh5a7ze54jc	cmqt9883d000xwkh5vdlw2qsa	{"maxDiscountPct": 15, "maxRentFreeDays": 60, "fitoutDeadlineDays": 90, "minLeaseTermMonths": 12, "requireCeoForDiscount": 20, "invoicePaymentTermDays": 30, "requireLegalForDiscount": 10}	{"dsoTarget": 30, "renewalRate": 85, "occupancyRate": 95, "collectionRate": 98, "fitoutOnTimeRate": 90, "ticketSlaCompliance": 95}	t	2026-06-25 08:43:13.585	2026-06-25 08:43:13.585
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Notification" (id, "userId", "tenantId", title, body, type, "entityType", "entityId", "isRead", "createdAt") FROM stdin;
cmqt98od800s7wkh59wcadgg0	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0001 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98det009jwkh5j85g0xpj	t	2026-06-25 08:43:11.325
cmqt98oef00s9wkh58g43tfre	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0002 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dhd009lwkh5pvyk8eqq	t	2026-06-25 08:43:11.367
cmqt98ofl00sbwkh5t3ws3qnh	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0003 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dil009nwkh5d6mo0fkl	t	2026-06-25 08:43:11.409
cmqt98ogr00sdwkh558qgbnw8	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0004 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98djz009pwkh5a14v0peu	t	2026-06-25 08:43:11.45
cmqt98ohv00sfwkh5lgh8mybo	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0005 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dlg009rwkh50zxulkku	t	2026-06-25 08:43:11.491
cmqt98oiq00shwkh5g5uhnyfu	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0006 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dmo009twkh52rho1rib	f	2026-06-25 08:43:11.523
cmqt98ojp00sjwkh55cz85xyj	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0007 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dnt009vwkh5bac5obfj	f	2026-06-25 08:43:11.557
cmqt98okm00slwkh5v0y4kdji	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0008 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dq8009xwkh538m7i6hf	f	2026-06-25 08:43:11.59
cmqt98olk00snwkh50khm7mlp	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0009 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98det009jwkh5j85g0xpj	f	2026-06-25 08:43:11.625
cmqt98omh00spwkh5tc8eix0b	cmqt987ne0002wkh5jxwbedq2	\N	New Proposal Submitted	Proposal PROP-2026-0010 has been submitted for review.	PROPOSAL_SUBMITTED	PROPOSAL	cmqt98dhd009lwkh5pvyk8eqq	f	2026-06-25 08:43:11.658
cmqt98one00srwkh5t97db7fj	cmqt987pp0004wkh5w0o8tqbi	\N	Invoice Overdue	Invoice has been overdue for more than 30 days.	INVOICE_OVERDUE	INVOICE	cmqt98h8z00g5wkh56hc9cs80	f	2026-06-25 08:43:11.691
cmqt98oob00stwkh57s677gpl	cmqt987pp0004wkh5w0o8tqbi	\N	Invoice Overdue	Invoice has been overdue for more than 30 days.	INVOICE_OVERDUE	INVOICE	cmqt98hep00gdwkh5ipwwupqd	f	2026-06-25 08:43:11.724
cmqt98op900svwkh5y200d23h	cmqt987pp0004wkh5w0o8tqbi	\N	Invoice Overdue	Invoice has been overdue for more than 30 days.	INVOICE_OVERDUE	INVOICE	cmqt98hk800glwkh5o4pm35n4	f	2026-06-25 08:43:11.758
cmqt98oq600sxwkh5psq3dpyw	cmqt987pp0004wkh5w0o8tqbi	\N	Invoice Overdue	Invoice has been overdue for more than 30 days.	INVOICE_OVERDUE	INVOICE	cmqt98hpj00gtwkh5ntx8xdyo	f	2026-06-25 08:43:11.79
cmqt98or400szwkh5h6ewva6q	cmqt987pp0004wkh5w0o8tqbi	\N	Invoice Overdue	Invoice has been overdue for more than 30 days.	INVOICE_OVERDUE	INVOICE	cmqt98hsj00gzwkh55i8h04je	f	2026-06-25 08:43:11.825
\.


--
-- Data for Name: OccupancySnapshot; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."OccupancySnapshot" (id, "mallId", "floorId", category, period, "snapshotDate", "totalUnits", "occupiedUnits", "vacantUnits", "underFitout", "totalAreaSqm", "occupiedAreaSqm", "occupancyRate", "revenuePerSqm", "createdAt") FROM stdin;
cmqt98q5d00ubwkh5ixblemla	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-01	2025-12-31 17:00:00	50	45	5	0	10000	9016.71456750939	90.1671456750939	498243.5758111957	2026-06-25 08:43:13.633
cmqt98q6h00udwkh5v2m3kxhi	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-02	2026-01-31 17:00:00	50	44	6	2	10000	8772.95025643032	87.7295025643032	419468.2023765587	2026-06-25 08:43:13.674
cmqt98q7f00ufwkh538f09lup	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-03	2026-02-28 17:00:00	50	47	3	3	10000	9421.106871853139	94.2110687185314	482426.3671780137	2026-06-25 08:43:13.707
cmqt98q8k00uhwkh5bd5rf5rb	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-04	2026-03-31 17:00:00	50	47	3	2	10000	9469.090196802796	94.69090196802796	452491.0667316074	2026-06-25 08:43:13.749
cmqt98qc200ujwkh51mw3sjsa	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-05	2026-04-30 17:00:00	50	43	7	2	10000	8501.968403433491	85.01968403433492	407808.1202066819	2026-06-25 08:43:13.874
cmqt98qcz00ulwkh5g72k5qeu	cmqt9883d000xwkh5vdlw2qsa	\N	\N	2026-06	2026-05-31 17:00:00	50	46	4	3	10000	9192.590136741326	91.92590136741326	493591.8887590753	2026-06-25 08:43:13.907
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Payment" (id, "invoiceId", "tenantId", amount, method, reference, "paidAt", notes, "createdAt") FROM stdin;
cmqt98hde00gbwkh54eutjpk2	cmqt98h8z00g5wkh56hc9cs80	cmqt989zj003swkh596wgouii	148500000	BANK_TRANSFER	TXN-2026-03-0001	2026-03-10 00:00:00	Full payment received	2026-06-25 08:43:02.258
cmqt98hhk00gjwkh5zxcf775f	cmqt98hep00gdwkh5ipwwupqd	cmqt989zj003twkh5hxztnsx4	193050000	BANK_TRANSFER	TXN-2026-03-0002	2026-03-10 00:00:00	Full payment received	2026-06-25 08:43:02.408
cmqt98hoh00grwkh5mb42ilhd	cmqt98hk800glwkh5o4pm35n4	cmqt98a1t003ywkh5v11or50n	86240000	BANK_TRANSFER	TXN-2026-03-0003	2026-03-10 00:00:00	Full payment received	2026-06-25 08:43:02.658
cmqt98i7t00hnwkh54anf981g	cmqt98i4f00hhwkh5v229cejr	cmqt989zi003rwkh54nluj9gq	124300000	BANK_TRANSFER	TXN-PARTIAL-2026-03-0008	2026-03-12 00:00:00	Partial payment received	2026-06-25 08:43:03.352
cmqt98igh00i1wkh51zgwaw83	cmqt98idl00hvwkh5hikjrjdl	cmqt98a1x0040wkh5lyyd6rdx	160380000	BANK_TRANSFER	TXN-2026-03-0010	2026-03-10 00:00:00	Full payment received	2026-06-25 08:43:03.666
cmqt98ikn00i9wkh5npthq394	cmqt98iht00i3wkh5sf5wg11a	cmqt989zj003swkh596wgouii	148500000	BANK_TRANSFER	TXN-2026-04-0011	2026-04-10 00:00:00	Full payment received	2026-06-25 08:43:03.816
cmqt98iol00ihwkh58layjzfn	cmqt98ilq00ibwkh5b18igdpr	cmqt989zj003twkh5hxztnsx4	193050000	BANK_TRANSFER	TXN-2026-04-0012	2026-04-10 00:00:00	Full payment received	2026-06-25 08:43:03.957
cmqt98isk00ipwkh5x4x2aqqm	cmqt98ipm00ijwkh5zteqacmu	cmqt98a1t003ywkh5v11or50n	86240000	BANK_TRANSFER	TXN-2026-04-0013	2026-04-10 00:00:00	Full payment received	2026-06-25 08:43:04.1
cmqt98jad00jlwkh57qsvxwld	cmqt98j5z00jfwkh5s4pnb9pt	cmqt989zi003rwkh54nluj9gq	124300000	BANK_TRANSFER	TXN-PARTIAL-2026-04-0018	2026-04-12 00:00:00	Partial payment received	2026-06-25 08:43:04.741
cmqt98jje00jzwkh55lf4h4nj	cmqt98jf300jtwkh5s99nu0pi	cmqt98a1x0040wkh5lyyd6rdx	160380000	BANK_TRANSFER	TXN-2026-04-0020	2026-04-10 00:00:00	Full payment received	2026-06-25 08:43:05.066
cmqt98jnk00k7wkh5ia3r8ovs	cmqt98jkm00k1wkh5npi50rw3	cmqt989zj003swkh596wgouii	148500000	BANK_TRANSFER	TXN-2026-05-0021	2026-05-10 00:00:00	Full payment received	2026-06-25 08:43:05.216
cmqt98js200kfwkh5unveif5d	cmqt98jom00k9wkh59w26wibc	cmqt989zj003twkh5hxztnsx4	193050000	BANK_TRANSFER	TXN-2026-05-0022	2026-05-10 00:00:00	Full payment received	2026-06-25 08:43:05.378
cmqt98jwm00knwkh5kdrjvwvh	cmqt98jtl00khwkh5wbs91nwh	cmqt98a1t003ywkh5v11or50n	86240000	BANK_TRANSFER	TXN-2026-05-0023	2026-05-10 00:00:00	Full payment received	2026-06-25 08:43:05.542
cmqt98kgh00ljwkh5zndc3dil	cmqt98kdm00ldwkh50e60cr7r	cmqt989zi003rwkh54nluj9gq	124300000	BANK_TRANSFER	TXN-PARTIAL-2026-05-0028	2026-05-12 00:00:00	Partial payment received	2026-06-25 08:43:06.258
cmqt98ko600lxwkh5tfp5jsdw	cmqt98klb00lrwkh5z1xmnc2i	cmqt98a1x0040wkh5lyyd6rdx	160380000	BANK_TRANSFER	TXN-2026-05-0030	2026-05-10 00:00:00	Full payment received	2026-06-25 08:43:06.534
\.


--
-- Data for Name: PaymentReconciliation; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."PaymentReconciliation" (id, "paymentId", "bankStatementId", "bankRef", "bankAmount", variance, status, "reconciledById", "reconciledAt") FROM stdin;
\.


--
-- Data for Name: PenaltyInterestPolicy; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."PenaltyInterestPolicy" (id, code, name, "annualRate", "graceDays", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt987y0000owkh5sch8q96m	DEFAULT_PENALTY	Default late payment penalty	12	7	t	2026-06-25 08:42:50.041	2026-06-25 08:42:50.041
\.


--
-- Data for Name: Proposal; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Proposal" (id, "proposalNumber", "leadId", "tenantId", "unitId", area, term, "startDate", "endDate", "rentPerSqm", "camPerSqm", deposit, "rentFree", "escalationPercent", "revenueSharePercent", "marketingFee", "monthlyRent", "monthlyCAM", "depositAmount", "totalContractValue", discount, status, notes, "businessModel", "serviceFeeSqm", "businessSupportFeeSqm", "rentCurrency", "fitoutDays", "handoverDate", "openingDate", "specialConditions", "editorContent", "createdById", "isActive", "deletedAt", "createdAt", "updatedAt", "bookingId") FROM stdin;
cmqt98det009jwkh5j85g0xpj	PROP-2026-0001	cmqt98b9q006awkh5o6khpcgl	cmqt989zj003swkh596wgouii	cmqt98axw005qwkh5mr42iei8	270	36	2026-07-01 00:00:00	2029-06-30 00:00:00	700000	85000	3	30	5	0	0	189000000	22950000	567000000	6804000000	8	APPROVED	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.125	2026-06-25 08:42:57.125	\N
cmqt98dhd009lwkh5pvyk8eqq	PROP-2026-0002	cmqt98bcy006gwkh5s495aeeo	cmqt989zj003twkh5hxztnsx4	cmqt98aza005swkh501t8wq3e	135	36	2026-07-01 00:00:00	2029-06-30 00:00:00	650000	80000	3	0	5	0	0	87750000	10800000	263250000	3159000000	3	APPROVED	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.217	2026-06-25 08:42:57.217	\N
cmqt98dil009nwkh5d6mo0fkl	PROP-2026-0003	cmqt98bnl006ywkh5g6m8p7w5	cmqt98a1t003ywkh5v11or50n	cmqt98b0g005uwkh5w6zojczd	162	36	2026-07-01 00:00:00	2029-06-30 00:00:00	700000	85000	3	0	5	0	0	113400000	13770000	340200000	4082400000	0	UNDER_REVIEW	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.26	2026-06-25 08:42:57.26	\N
cmqt98djz009pwkh5a14v0peu	PROP-2026-0004	cmqt98bs80072wkh5vo1qjbsl	cmqt989zk003uwkh58qv3to2h	cmqt98b1m005wwkh5efm9fpbx	198	36	2026-07-01 00:00:00	2029-06-30 00:00:00	650000	80000	3	30	5	0	0	128700000	15840000	386100000	4633200000	0	UNDER_REVIEW	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.311	2026-06-25 08:42:57.311	\N
cmqt98dlg009rwkh50zxulkku	PROP-2026-0005	cmqt98bzu007gwkh5tx8b1zuu	cmqt989zk003vwkh5vfomnbpr	cmqt98b2r005ywkh54alm7qht	1080	36	2026-07-01 00:00:00	2029-06-30 00:00:00	400000	60000	3	0	5	0	0	432000000	64800000	1296000000	15552000000	8	SUBMITTED	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.363	2026-06-25 08:42:57.363	\N
cmqt98dmo009twkh52rho1rib	PROP-2026-0006	cmqt98c6u007uwkh58bg59z3j	cmqt98a1h003wwkh5lm7lw5bk	cmqt98b3x0060wkh5tnjzwjih	315	36	2026-07-01 00:00:00	2029-06-30 00:00:00	600000	75000	3	0	5	0	0	189000000	23625000	567000000	6804000000	3	SUBMITTED	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.408	2026-06-25 08:42:57.408	\N
cmqt98dnt009vwkh5bac5obfj	PROP-2026-0007	cmqt98cf60088wkh5pdryjyrb	cmqt98a1s003xwkh5rj5zagap	cmqt98b520062wkh5zq4md46s	360	36	2026-07-01 00:00:00	2029-06-30 00:00:00	600000	75000	3	30	5	0	0	216000000	27000000	648000000	7776000000	0	DRAFT	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.449	2026-06-25 08:42:57.449	\N
cmqt98dq8009xwkh538m7i6hf	PROP-2026-0008	cmqt98cjj008ewkh5qek4op86	cmqt989zi003rwkh54nluj9gq	cmqt98b680064wkh5arh0zk3k	180	36	2026-07-01 00:00:00	2029-06-30 00:00:00	550000	70000	3	0	5	0	0	99000000	12600000	297000000	3564000000	0	DRAFT	Standard lease proposal	\N	0	0	VND	90	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	t	\N	2026-06-25 08:42:57.536	2026-06-25 08:42:57.536	\N
\.


--
-- Data for Name: ProposalDealScore; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ProposalDealScore" (id, "proposalId", "totalScore", grade, breakdown, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ProposalNegotiationRound; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ProposalNegotiationRound" (id, "proposalId", "roundNumber", "offeredBy", "rentPerSqm", discount, "rentFree", "camPerSqm", note, "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: ProposalScenario; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ProposalScenario" (id, "proposalId", name, description, "isSelected", terms, score, "createdAt", "updatedAt") FROM stdin;
cmqt98qjt00uwwkh5c8cz5svb	cmqt98det009jwkh5j85g0xpj	Kịch bản A — Cơ sở	Điều khoản tiêu chuẩn không chiết khấu	t	{"area": 100, "term": 24, "deposit": 3, "discount": 0, "rentFree": 0, "camPerSqm": 50000, "escalation": 5, "rentPerSqm": 500000, "totalValue": 1320000000, "monthlyRent": 55000000, "depositAmount": 165000000}	72	2026-06-25 08:43:14.153	2026-06-25 08:43:14.153
cmqt98qjt00uxwkh5cyfoa4e0	cmqt98det009jwkh5j85g0xpj	Kịch bản B — Ưu đãi	Chiết khấu 10% + 1 tháng miễn phí	f	{"area": 100, "term": 24, "deposit": 3, "discount": 10, "rentFree": 1, "camPerSqm": 50000, "escalation": 5, "rentPerSqm": 500000, "totalValue": 1138500000, "monthlyRent": 49500000, "depositAmount": 148500000}	55	2026-06-25 08:43:14.153	2026-06-25 08:43:14.153
\.


--
-- Data for Name: ProposalVersion; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."ProposalVersion" (id, "proposalId", version, snapshot, "changeReason", "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: RenewalRiskScore; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."RenewalRiskScore" (id, "contractId", "riskScore", "riskLevel", factors, "daysToExpiry", "calculatedAt", recommendation) FROM stdin;
\.


--
-- Data for Name: SalesAuditTrail; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SalesAuditTrail" (id, "salesId", action, "oldValue", "newValue", reason, "performedById", "performedAt") FROM stdin;
\.


--
-- Data for Name: SalesTurnover; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SalesTurnover" (id, "tenantId", "unitId", date, period, "grossSales", "netSales", transactions, "recordedById", notes, "createdAt", "updatedAt") FROM stdin;
cmqt98mi000p3wkh5k1auayrc	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	2026-03-01 00:00:00	2026-03	277005545	249304990.5	879	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:08.903	2026-06-25 08:43:08.903
cmqt98mjd00p5wkh53honn4lr	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	2026-03-01 00:00:00	2026-03	481285945	433157350.5	1934	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:08.953	2026-06-25 08:43:08.953
cmqt98mkh00p7wkh55qerdihr	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	2026-03-01 00:00:00	2026-03	469915234	422923710.6	2017	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:08.993	2026-06-25 08:43:08.993
cmqt98mld00p9wkh5ja1c8uj1	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	2026-03-01 00:00:00	2026-03	246411610	221770449	624	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.025	2026-06-25 08:43:09.025
cmqt98mmb00pbwkh5lmtjckqz	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	2026-03-01 00:00:00	2026-03	298635943	268772348.7	1413	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.059	2026-06-25 08:43:09.059
cmqt98mng00pdwkh5wxbgzd9k	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	2026-03-01 00:00:00	2026-03	577747791	519973011.9	518	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.1	2026-06-25 08:43:09.1
cmqt98mod00pfwkh5432ib1y7	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	2026-03-01 00:00:00	2026-03	274644809	247180328.1	2411	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.134	2026-06-25 08:43:09.134
cmqt98mpa00phwkh5a4zecjbk	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	2026-03-01 00:00:00	2026-03	316847107	285162396.3	1964	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.167	2026-06-25 08:43:09.167
cmqt98mqa00pjwkh5xx28l3m8	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	2026-03-01 00:00:00	2026-03	305927415	275334673.5	1011	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.202	2026-06-25 08:43:09.202
cmqt98mro00plwkh5qe4v92bu	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	2026-03-01 00:00:00	2026-03	355358437	319822593.3	595	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-03	2026-06-25 08:43:09.252	2026-06-25 08:43:09.252
cmqt98mst00pnwkh5fks8feb6	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	2026-04-01 00:00:00	2026-04	350153664	315138297.6	2371	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.293	2026-06-25 08:43:09.293
cmqt98mtz00ppwkh5hski99oc	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	2026-04-01 00:00:00	2026-04	282343256	254108930.4	2464	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.335	2026-06-25 08:43:09.335
cmqt98mv500prwkh5ar0mn7iu	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	2026-04-01 00:00:00	2026-04	212744308	191469877.2	1261	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.377	2026-06-25 08:43:09.377
cmqt98mxd00ptwkh5f574lk1i	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	2026-04-01 00:00:00	2026-04	456788631	411109767.9	1397	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.457	2026-06-25 08:43:09.457
cmqt98myb00pvwkh5plh3exmx	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	2026-04-01 00:00:00	2026-04	533338230	480004407	2222	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.491	2026-06-25 08:43:09.491
cmqt98mz800pxwkh5jqhu4c90	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	2026-04-01 00:00:00	2026-04	327346626	294611963.4	1708	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.524	2026-06-25 08:43:09.524
cmqt98n0500pzwkh5p4i3rbf3	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	2026-04-01 00:00:00	2026-04	319778455	287800609.5	1069	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.557	2026-06-25 08:43:09.557
cmqt98n1400q1wkh5w7v16akq	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	2026-04-01 00:00:00	2026-04	229491536	206542382.4	1441	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.592	2026-06-25 08:43:09.592
cmqt98n2b00q3wkh5lxh09rwn	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	2026-04-01 00:00:00	2026-04	489089941	440180946.9	1817	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.635	2026-06-25 08:43:09.635
cmqt98n3f00q5wkh51rejj7aj	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	2026-04-01 00:00:00	2026-04	493955925	444560332.5	1570	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-04	2026-06-25 08:43:09.675	2026-06-25 08:43:09.675
cmqt98n4l00q7wkh5s7mpuns9	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	2026-05-01 00:00:00	2026-05	362022005	325819804.5	1788	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.717	2026-06-25 08:43:09.717
cmqt98n5p00q9wkh5dhw3p1n6	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	2026-05-01 00:00:00	2026-05	339717027	305745324.3	2066	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.757	2026-06-25 08:43:09.757
cmqt98n8400qbwkh5fcwch92j	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	2026-05-01 00:00:00	2026-05	165453384	148908045.6	1758	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.843	2026-06-25 08:43:09.843
cmqt98n9q00qdwkh5i0s34yb5	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	2026-05-01 00:00:00	2026-05	155598414	140038572.6	1698	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.902	2026-06-25 08:43:09.902
cmqt98naw00qfwkh5txjn83g7	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	2026-05-01 00:00:00	2026-05	191084877	171976389.3	1224	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.944	2026-06-25 08:43:09.944
cmqt98nbz00qhwkh5hm90sbqi	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	2026-05-01 00:00:00	2026-05	242479314	218231382.6	1857	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:09.983	2026-06-25 08:43:09.983
cmqt98nea00qjwkh5g9lcpc2e	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	2026-05-01 00:00:00	2026-05	137458000	123712200	1166	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:10.066	2026-06-25 08:43:10.066
cmqt98nf700qlwkh56h21uzh6	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	2026-05-01 00:00:00	2026-05	116674715	105007243.5	760	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:10.099	2026-06-25 08:43:10.099
cmqt98ng400qnwkh54mkpgik4	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	2026-05-01 00:00:00	2026-05	312354676	281119208.4	1113	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:10.133	2026-06-25 08:43:10.133
cmqt98nh100qpwkh5gewn7jap	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	2026-05-01 00:00:00	2026-05	236633360	212970024	920	cmqt987pp0004wkh5w0o8tqbi	Sales report for 2026-05	2026-06-25 08:43:10.166	2026-06-25 08:43:10.166
\.


--
-- Data for Name: SapEntityMapping; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SapEntityMapping" (id, "entityType", "entityId", "sapRef", "sapSystem", "sapCompanyCode", "lastSyncAt", "syncStatus", notes, "createdAt", "updatedAt") FROM stdin;
cmqt98ql300uywkh5v6owd36j	TENANT	cmqt989zj003swkh596wgouii	BP-10001	S4HANA	1000	2026-06-25 08:43:14.199	SYNCED	\N	2026-06-25 08:43:14.199	2026-06-25 08:43:14.199
cmqt98qma00uzwkh52oqgvgeu	INVOICE	cmqt98h8z00g5wkh56hc9cs80	AR-20001	S4HANA	1000	2026-06-25 08:43:14.242	SYNCED	\N	2026-06-25 08:43:14.242	2026-06-25 08:43:14.242
\.


--
-- Data for Name: SapIntegrationLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SapIntegrationLog" (id, "entityType", "entityId", endpoint, payload, response, status, "retryCount", "errorMessage", "idempotencyKey", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SapReconciliationRecord; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SapReconciliationRecord" (id, "entityType", "entityId", "sapRef", "ourAmount", "sapAmount", status, "idempotencyKey", notes, "reconciledAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SlotBooking; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SlotBooking" (id, "bookingRef", "slotId", "leadId", "customerId", type, "startDatetime", "endDatetime", "totalArea", "baseAmount", "discountPct", "totalAmount", status, notes, "cancelReason", "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SlotPricingRule; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."SlotPricingRule" (id, "slotId", name, "ruleType", multiplier, "discountPct", "minDays", "startDate", "endDate", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Tenant; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Tenant" (id, "companyName", "brandName", "taxCode", "contactName", "contactEmail", "contactPhone", address, category, "categoryId", logo, "isPortalUser", "portalEmail", "portalPassword", "isActive", "deletedAt", "createdAt", "updatedAt") FROM stdin;
cmqt989zj003swkh596wgouii	Highlands Coffee Vietnam Co., Ltd	Highlands Coffee	0123456789	Nguyen Van Hung	hung@highlands.com.vn	0281234567	\N	F&B	\N	\N	t	portal.highlands@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.684	2026-06-25 08:42:52.684
cmqt989zi003rwkh54nluj9gq	Shopee Vietnam Co., Ltd	Shopee	0123456796	Chen Wei	wei@shopee.vn	0281234574	\N	Technology	\N	\N	t	portal.shopee@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.684	2026-06-25 08:42:52.684
cmqt989zk003uwkh58qv3to2h	Guardian Vietnam Co., Ltd	Guardian	0123456792	Le Thi Mai	mai@guardian.com.vn	0281234570	\N	Health & Beauty	\N	\N	t	portal.guardian@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.684	2026-06-25 08:42:52.684
cmqt989zk003vwkh5vfomnbpr	Circle K Vietnam Co., Ltd	Circle K	0123456793	Tran Van Duc	duc@circlek.com.vn	0281234571	\N	Convenience Store	\N	\N	t	portal.circlek@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.683	2026-06-25 08:42:52.683
cmqt989zj003twkh5hxztnsx4	Jollibee Vietnam Co., Ltd	Jollibee	0123456790	Maria Santos	maria@jollibee.com.vn	0281234568	\N	F&B	\N	\N	t	portal.jollibee@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.684	2026-06-25 08:42:52.684
cmqt98a1h003wwkh5lm7lw5bk	McDonald's Vietnam Co., Ltd	McDonald's	0123456794	James Wilson	james@mcdonalds.com.vn	0281234572	\N	F&B	\N	\N	t	portal.mcdonalds@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.686	2026-06-25 08:42:52.686
cmqt98a1s003xwkh5rj5zagap	The Coffee House Vietnam Co., Ltd	The Coffee House	0123456795	Pham Minh Trung	trung@thecoffeehouse.com	0281234573	\N	F&B	\N	\N	t	portal.coffeehouse@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.685	2026-06-25 08:42:52.685
cmqt98a1t003ywkh5v11or50n	Fast Retailing Vietnam Co., Ltd	Uniqlo	0123456791	Tanaka Hiroshi	tanaka@uniqlo.com.vn	0281234569	\N	Fashion	\N	\N	t	portal.uniqlo@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.686	2026-06-25 08:42:52.686
cmqt98a1x0040wkh5lyyd6rdx	Lotteria Vietnam Co., Ltd	Lotteria	0123456798	Kim Sung Jin	sung@lotteria.vn	0281234576	\N	F&B	\N	\N	t	portal.lotteria@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.688	2026-06-25 08:42:52.688
cmqt98a1w003zwkh5bqbehrbe	FPT Retail Co., Ltd	FPT Retail	0123456797	Nguyen Duc Tai	tai@fptretail.com	0281234575	\N	Technology	\N	\N	t	portal.fptretail@thiso.com	$2b$10$LRlx0iPV46X3aTzAS.uZ..N2fUxDkMmiTNOhiv3o7zKL2bTN5Eg5K	t	\N	2026-06-25 08:42:52.687	2026-06-25 08:42:52.687
\.


--
-- Data for Name: Ticket; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Ticket" (id, "ticketNumber", "tenantId", "unitId", type, priority, sla, "slaDueAt", subject, description, "assignedToId", status, "resolvedAt", "closedAt", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98kp700lzwkh5ywwnmta0	TKT-2026-0001	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	ELECTRICAL	URGENT	4	\N	ELECTRICAL issue in unit GF-A01	Tenant reported electrical problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	NEW	\N	\N	t	2026-06-25 08:43:06.571	2026-06-25 08:43:06.571
cmqt98ks300m3wkh55dn1pju7	TKT-2026-0002	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	WATER	LOW	24	\N	WATER issue in unit GF-A02	Tenant reported water problem. Needs immediate attention.	\N	ASSIGNED	\N	\N	t	2026-06-25 08:43:06.675	2026-06-25 08:43:06.675
cmqt98kv400m9wkh5q1yojl18	TKT-2026-0003	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	HVAC	MEDIUM	24	\N	HVAC issue in unit GF-B01	Tenant reported hvac problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	IN_PROGRESS	\N	\N	t	2026-06-25 08:43:06.784	2026-06-25 08:43:06.784
cmqt98ky400mfwkh5ezj8qvdi	TKT-2026-0004	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	CLEANING	HIGH	8	\N	CLEANING issue in unit GF-B02	Tenant reported cleaning problem. Needs immediate attention.	\N	RESOLVED	2026-05-15 00:00:00	\N	t	2026-06-25 08:43:06.892	2026-06-25 08:43:06.892
cmqt98l0v00mlwkh5qms1mffx	TKT-2026-0005	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	SECURITY	URGENT	4	\N	SECURITY issue in unit GF-C01	Tenant reported security problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	CLOSED	2026-05-15 00:00:00	2026-05-16 00:00:00	t	2026-06-25 08:43:06.991	2026-06-25 08:43:06.991
cmqt98l3n00mrwkh5uonfs5y1	TKT-2026-0006	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	PARKING	LOW	24	\N	PARKING issue in unit GF-C02	Tenant reported parking problem. Needs immediate attention.	\N	WAITING_TENANT	\N	\N	t	2026-06-25 08:43:07.091	2026-06-25 08:43:07.091
cmqt98l8a00mxwkh5670opq95	TKT-2026-0007	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	INTERNET	HIGH	8	\N	INTERNET issue in unit L1-A01	Tenant reported internet problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	NEW	\N	\N	t	2026-06-25 08:43:07.258	2026-06-25 08:43:07.258
cmqt98la500n1wkh5sjlhign6	TKT-2026-0008	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	OTHER	LOW	24	\N	OTHER issue in unit L1-A02	Tenant reported other problem. Needs immediate attention.	\N	ASSIGNED	\N	\N	t	2026-06-25 08:43:07.325	2026-06-25 08:43:07.325
cmqt98lcz00n7wkh50sc6v5v0	TKT-2026-0009	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	ELECTRICAL	URGENT	4	\N	ELECTRICAL issue in unit L1-B01	Tenant reported electrical problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	IN_PROGRESS	\N	\N	t	2026-06-25 08:43:07.426	2026-06-25 08:43:07.426
cmqt98lga00ndwkh59b6pmbe8	TKT-2026-0010	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	WATER	HIGH	8	\N	WATER issue in unit L1-B02	Tenant reported water problem. Needs immediate attention.	\N	RESOLVED	2026-05-15 00:00:00	\N	t	2026-06-25 08:43:07.546	2026-06-25 08:43:07.546
cmqt98ll100njwkh58ol913lq	TKT-2026-0011	cmqt989zj003swkh596wgouii	cmqt98a7z004mwkh5bgyk0p3o	HVAC	MEDIUM	24	\N	HVAC issue in unit GF-A01	Tenant reported hvac problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	CLOSED	2026-05-15 00:00:00	2026-05-16 00:00:00	t	2026-06-25 08:43:07.717	2026-06-25 08:43:07.717
cmqt98lnu00npwkh5g25aeiou	TKT-2026-0012	cmqt989zj003twkh5hxztnsx4	cmqt98a95004owkh572ch0mtj	CLEANING	LOW	24	\N	CLEANING issue in unit GF-A02	Tenant reported cleaning problem. Needs immediate attention.	\N	WAITING_TENANT	\N	\N	t	2026-06-25 08:43:07.818	2026-06-25 08:43:07.818
cmqt98ls700nvwkh594fiumrf	TKT-2026-0013	cmqt98a1t003ywkh5v11or50n	cmqt98aa9004qwkh54qyn8cmq	SECURITY	URGENT	4	\N	SECURITY issue in unit GF-B01	Tenant reported security problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	NEW	\N	\N	t	2026-06-25 08:43:07.975	2026-06-25 08:43:07.975
cmqt98luy00nzwkh5lggb66ln	TKT-2026-0014	cmqt989zk003uwkh58qv3to2h	cmqt98aba004swkh56h4uizq3	PARKING	LOW	24	\N	PARKING issue in unit GF-B02	Tenant reported parking problem. Needs immediate attention.	\N	ASSIGNED	\N	\N	t	2026-06-25 08:43:08.074	2026-06-25 08:43:08.074
cmqt98lxq00o5wkh5zkdmbb1y	TKT-2026-0015	cmqt989zk003vwkh5vfomnbpr	cmqt98ad1004uwkh5stppydjy	INTERNET	MEDIUM	24	\N	INTERNET issue in unit GF-C01	Tenant reported internet problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	IN_PROGRESS	\N	\N	t	2026-06-25 08:43:08.174	2026-06-25 08:43:08.174
cmqt98m4800obwkh5xn1ie8fo	TKT-2026-0016	cmqt98a1h003wwkh5lm7lw5bk	cmqt98ady004wwkh5nfmtik7d	OTHER	HIGH	8	\N	OTHER issue in unit GF-C02	Tenant reported other problem. Needs immediate attention.	\N	RESOLVED	2026-05-15 00:00:00	\N	t	2026-06-25 08:43:08.409	2026-06-25 08:43:08.409
cmqt98m7000ohwkh59j7sjo52	TKT-2026-0017	cmqt98a1s003xwkh5rj5zagap	cmqt98aey004ywkh533xmnaxg	ELECTRICAL	URGENT	4	\N	ELECTRICAL issue in unit L1-A01	Tenant reported electrical problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	CLOSED	2026-05-15 00:00:00	2026-05-16 00:00:00	t	2026-06-25 08:43:08.508	2026-06-25 08:43:08.508
cmqt98m9v00onwkh5d7dv6qiu	TKT-2026-0018	cmqt989zi003rwkh54nluj9gq	cmqt98afw0050wkh5t6av37in	WATER	LOW	24	\N	WATER issue in unit L1-A02	Tenant reported water problem. Needs immediate attention.	\N	WAITING_TENANT	\N	\N	t	2026-06-25 08:43:08.611	2026-06-25 08:43:08.611
cmqt98md100otwkh5ks64une1	TKT-2026-0019	cmqt98a1w003zwkh5bqbehrbe	cmqt98ai90052wkh5oojtfesd	HVAC	HIGH	8	\N	HVAC issue in unit L1-B01	Tenant reported hvac problem. Needs immediate attention.	cmqt987si0006wkh56418hk6e	NEW	\N	\N	t	2026-06-25 08:43:08.725	2026-06-25 08:43:08.725
cmqt98mew00oxwkh5h8b8o5vb	TKT-2026-0020	cmqt98a1x0040wkh5lyyd6rdx	cmqt98ajo0054wkh5ufezk8lk	CLEANING	LOW	24	\N	CLEANING issue in unit L1-B02	Tenant reported cleaning problem. Needs immediate attention.	\N	ASSIGNED	\N	\N	t	2026-06-25 08:43:08.792	2026-06-25 08:43:08.792
\.


--
-- Data for Name: TicketComment; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."TicketComment" (id, "ticketId", "userId", content, "isInternal", "createdAt") FROM stdin;
cmqt98kqs00m1wkh5vkevj4o3	cmqt98kp700lzwkh5ywwnmta0	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:06.628
cmqt98kt100m5wkh5pg8m1xy1	cmqt98ks300m3wkh55dn1pju7	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:06.709
cmqt98ku600m7wkh5pndl50bg	cmqt98ks300m3wkh55dn1pju7	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:06.75
cmqt98kw900mbwkh5evl0qhec	cmqt98kv400m9wkh5q1yojl18	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:06.825
cmqt98kx600mdwkh5xgk0f0a4	cmqt98kv400m9wkh5q1yojl18	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:06.858
cmqt98kz100mhwkh5biq67o7h	cmqt98ky400mfwkh5ezj8qvdi	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:06.925
cmqt98kzy00mjwkh5t54vruyj	cmqt98ky400mfwkh5ezj8qvdi	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:06.958
cmqt98l1s00mnwkh51qcuherz	cmqt98l0v00mlwkh5qms1mffx	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.024
cmqt98l2q00mpwkh5pelbxyud	cmqt98l0v00mlwkh5qms1mffx	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.058
cmqt98l5y00mtwkh5xq39tlv1	cmqt98l3n00mrwkh5uonfs5y1	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.174
cmqt98l7c00mvwkh5l2ikr1mc	cmqt98l3n00mrwkh5uonfs5y1	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.224
cmqt98l9600mzwkh5dtxc7y33	cmqt98l8a00mxwkh5670opq95	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.291
cmqt98lb200n3wkh56d7qkx1w	cmqt98la500n1wkh5sjlhign6	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.358
cmqt98lbz00n5wkh50kpu0q7x	cmqt98la500n1wkh5sjlhign6	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.392
cmqt98le300n9wkh5oqxcdt2b	cmqt98lcz00n7wkh50sc6v5v0	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.467
cmqt98lf100nbwkh56jnemhcc	cmqt98lcz00n7wkh50sc6v5v0	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.502
cmqt98lhe00nfwkh5yuq0szy5	cmqt98lga00ndwkh59b6pmbe8	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.586
cmqt98ljw00nhwkh5g76qfz70	cmqt98lga00ndwkh59b6pmbe8	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.676
cmqt98llz00nlwkh5qa9i8pm6	cmqt98ll100njwkh58ol913lq	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.751
cmqt98lmw00nnwkh5cbfmlzak	cmqt98ll100njwkh58ol913lq	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.784
cmqt98loq00nrwkh5ui8s3arc	cmqt98lnu00npwkh5g25aeiou	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:07.851
cmqt98lr100ntwkh5r4jla751	cmqt98lnu00npwkh5g25aeiou	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:07.934
cmqt98lu200nxwkh5craqbfog	cmqt98ls700nvwkh594fiumrf	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.042
cmqt98lvo00o1wkh5obsoxw82	cmqt98luy00nzwkh5lggb66ln	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.1
cmqt98lwl00o3wkh5ihrzcwvf	cmqt98luy00nzwkh5lggb66ln	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.133
cmqt98lyo00o7wkh59pctzy50	cmqt98lxq00o5wkh5zkdmbb1y	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.209
cmqt98m3a00o9wkh5hk010s8r	cmqt98lxq00o5wkh5zkdmbb1y	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.374
cmqt98m5500odwkh5d9rru23n	cmqt98m4800obwkh5xn1ie8fo	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.441
cmqt98m6200ofwkh59wtea5w8	cmqt98m4800obwkh5xn1ie8fo	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.475
cmqt98m7x00ojwkh5eapug96o	cmqt98m7000ohwkh59j7sjo52	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.542
cmqt98m8v00olwkh53erx41t4	cmqt98m7000ohwkh59j7sjo52	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.575
cmqt98mb000opwkh5nb6xm14b	cmqt98m9v00onwkh5d7dv6qiu	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.652
cmqt98mc400orwkh59hq5wj2z	cmqt98m9v00onwkh5d7dv6qiu	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.692
cmqt98mdz00ovwkh50n52t75x	cmqt98md100otwkh5ks64une1	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.759
cmqt98mft00ozwkh56zyg9bdu	cmqt98mew00oxwkh5h8b8o5vb	cmqt987mh0001wkh5n3v0w9tq	Ticket received and being reviewed by operations team.	f	2026-06-25 08:43:08.826
cmqt98mgs00p1wkh5z3ayx8oz	cmqt98mew00oxwkh5h8b8o5vb	cmqt987si0006wkh56418hk6e	Operations team dispatched to investigate the issue.	t	2026-06-25 08:43:08.86
\.


--
-- Data for Name: TicketEscalation; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."TicketEscalation" (id, "ticketId", level, reason, "escalatedTo", "notifiedAt") FROM stdin;
\.


--
-- Data for Name: TicketFile; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."TicketFile" (id, "ticketId", "filePath", "fileName", "createdAt") FROM stdin;
\.


--
-- Data for Name: TicketRating; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."TicketRating" (id, "ticketId", rating, comment, "ratedAt") FROM stdin;
\.


--
-- Data for Name: TicketSlaPolicy; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."TicketSlaPolicy" (id, "ticketType", priority, "responseHours", "resolutionHours", "escalateToRole", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98pc000tkwkh59eqdinpy	ELECTRICAL	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:12.576	2026-06-25 08:43:12.576
cmqt98pdd00tlwkh537c68pjq	ELECTRICAL	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:12.626	2026-06-25 08:43:12.626
cmqt98pek00tmwkh5egxd1sno	ELECTRICAL	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:12.668	2026-06-25 08:43:12.668
cmqt98ph200tnwkh5yj68yv8i	ELECTRICAL	LOW	8	72	OPERATION	t	2026-06-25 08:43:12.758	2026-06-25 08:43:12.758
cmqt98phz00towkh5efeafz5a	WATER	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:12.791	2026-06-25 08:43:12.791
cmqt98piw00tpwkh5di54mk98	WATER	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:12.825	2026-06-25 08:43:12.825
cmqt98pjt00tqwkh53qinpz1u	WATER	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:12.858	2026-06-25 08:43:12.858
cmqt98pkr00trwkh57slforvm	WATER	LOW	8	72	OPERATION	t	2026-06-25 08:43:12.892	2026-06-25 08:43:12.892
cmqt98plo00tswkh5dbh0qqaf	HVAC	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:12.925	2026-06-25 08:43:12.925
cmqt98pmm00ttwkh515364w6b	HVAC	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:12.959	2026-06-25 08:43:12.959
cmqt98pni00tuwkh54z63pr5l	HVAC	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:12.991	2026-06-25 08:43:12.991
cmqt98ppx00tvwkh5phyjh4ps	HVAC	LOW	8	72	OPERATION	t	2026-06-25 08:43:13.077	2026-06-25 08:43:13.077
cmqt98pr200twwkh5fofrndi0	CLEANING	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:13.118	2026-06-25 08:43:13.118
cmqt98ps800txwkh5ehzc77fe	CLEANING	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:13.16	2026-06-25 08:43:13.16
cmqt98pte00tywkh5ta5e7ko8	CLEANING	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:13.202	2026-06-25 08:43:13.202
cmqt98puk00tzwkh532430a5i	CLEANING	LOW	8	72	OPERATION	t	2026-06-25 08:43:13.244	2026-06-25 08:43:13.244
cmqt98pvo00u0wkh5e7ynapmy	SECURITY	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:13.285	2026-06-25 08:43:13.285
cmqt98pwt00u1wkh5pd4pj4dh	SECURITY	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:13.325	2026-06-25 08:43:13.325
cmqt98pxp00u2wkh56nepvd1u	SECURITY	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:13.358	2026-06-25 08:43:13.358
cmqt98pyn00u3wkh53fflbj5v	SECURITY	LOW	8	72	OPERATION	t	2026-06-25 08:43:13.391	2026-06-25 08:43:13.391
cmqt98pzl00u4wkh54lmwc1dm	OTHER	URGENT	1	4	MALL_DIRECTOR	t	2026-06-25 08:43:13.425	2026-06-25 08:43:13.425
cmqt98q0j00u5wkh5c0odukmd	OTHER	HIGH	2	8	LEASING_MANAGER	t	2026-06-25 08:43:13.459	2026-06-25 08:43:13.459
cmqt98q1o00u6wkh5vc97ndcz	OTHER	MEDIUM	4	24	OPERATION	t	2026-06-25 08:43:13.5	2026-06-25 08:43:13.5
cmqt98q2u00u7wkh5cgor2op2	OTHER	LOW	8	72	OPERATION	t	2026-06-25 08:43:13.542	2026-06-25 08:43:13.542
\.


--
-- Data for Name: UnifiedDocument; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnifiedDocument" (id, "mallId", "entityType", "entityId", category, "documentType", "fileName", "filePath", "fileHash", "fileSize", "mimeType", version, "isLatest", "retentionYear", "deleteAfter", "signedAt", "signedBy", "uploadedById", "uploadedAt", "downloadCount", "isActive") FROM stdin;
\.


--
-- Data for Name: Unit; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Unit" (id, "mallId", "buildingId", "floorId", "zoneId", code, name, "areaGFA", "areaNLA", category, "categoryId", "baseRentPerSqm", "camPerSqm", status, "tenantId", "leaseStartDate", "leaseEndDate", description, "isActive", "createdAt", "updatedAt", "marketRentPerSqm", "askingRentPerSqm", "escalationRate", "minLeaseTerm", "maxLeaseTerm", "vacantSince", "lastRenovation", condition, features, "virtualTourUrl", "mapPosX", "mapPosY", "mapPosW", "mapPosH", "mapPolygon") FROM stdin;
cmqt98a7z004mwkh5bgyk0p3o	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988b0001bwkh5jbamsufg	GF-A01	Unit GF-A01	120	100	F&B	cmqt9894w002owkh5si36qbc4	1200000	150000	OCCUPIED	cmqt989zj003swkh596wgouii	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:52.991	2026-06-25 08:42:52.991	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98a95004owkh572ch0mtj	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988b0001bwkh5jbamsufg	GF-A02	Unit GF-A02	150	130	F&B	cmqt9894w002owkh5si36qbc4	1200000	150000	OCCUPIED	cmqt989zj003twkh5hxztnsx4	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.033	2026-06-25 08:42:53.033	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aa9004qwkh54qyn8cmq	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988bw001dwkh585v1ouid	GF-B01	Unit GF-B01	80	70	Convenience Store	cmqt989am002twkh5iihmdqor	1000000	120000	OCCUPIED	cmqt98a1t003ywkh5v11or50n	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.074	2026-06-25 08:42:53.074	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aba004swkh56h4uizq3	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988bw001dwkh585v1ouid	GF-B02	Unit GF-B02	200	180	Fashion	cmqt9896h002pwkh51w9j3hb1	900000	110000	OCCUPIED	cmqt989zk003uwkh58qv3to2h	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.11	2026-06-25 08:42:53.11	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98ad1004uwkh5stppydjy	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988d2001fwkh54t7qqmqj	GF-C01	Unit GF-C01	300	270	Fashion	cmqt9896h002pwkh51w9j3hb1	850000	100000	OCCUPIED	cmqt989zk003vwkh5vfomnbpr	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.172	2026-06-25 08:42:53.172	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98ady004wwkh5nfmtik7d	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	cmqt988d2001fwkh54t7qqmqj	GF-C02	Unit GF-C02	250	225	Health & Beauty	cmqt9897m002qwkh5pblytvnr	900000	110000	OCCUPIED	cmqt98a1h003wwkh5lm7lw5bk	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.206	2026-06-25 08:42:53.206	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aey004ywkh533xmnaxg	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988hb001lwkh50f67ahqh	L1-A01	Unit L1-A01	180	160	F&B	cmqt9894w002owkh5si36qbc4	1000000	130000	OCCUPIED	cmqt98a1s003xwkh5rj5zagap	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.242	2026-06-25 08:42:53.242	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98afw0050wkh5t6av37in	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988hb001lwkh50f67ahqh	L1-A02	Unit L1-A02	220	200	F&B	cmqt9894w002owkh5si36qbc4	1000000	130000	OCCUPIED	cmqt989zi003rwkh54nluj9gq	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.276	2026-06-25 08:42:53.276	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98ai90052wkh5oojtfesd	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988if001nwkh53lrpgh3v	L1-B01	Unit L1-B01	150	135	Fashion	cmqt9896h002pwkh51w9j3hb1	800000	100000	OCCUPIED	cmqt98a1w003zwkh5bqbehrbe	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.361	2026-06-25 08:42:53.361	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98ajo0054wkh5ufezk8lk	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988if001nwkh53lrpgh3v	L1-B02	Unit L1-B02	180	162	Fashion	cmqt9896h002pwkh51w9j3hb1	800000	100000	OCCUPIED	cmqt98a1x0040wkh5lyyd6rdx	2024-01-01 00:00:00	2026-12-31 00:00:00	\N	t	2026-06-25 08:42:53.412	2026-06-25 08:42:53.412	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98al10056wkh57k8ph84n	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988if001nwkh53lrpgh3v	L1-B03	Unit L1-B03	350	315	Fashion	cmqt9896h002pwkh51w9j3hb1	750000	95000	UNDER_FITOUT	\N	\N	\N	\N	t	2026-06-25 08:42:53.46	2026-06-25 08:42:53.46	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98am40058wkh5hvdbpd88	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	cmqt988jz001pwkh5xxr8h4dx	L1-C01	Unit L1-C01	100	90	Technology	cmqt9898j002rwkh5wk8568uy	900000	110000	UNDER_FITOUT	\N	\N	\N	\N	t	2026-06-25 08:42:53.501	2026-06-25 08:42:53.501	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aof005awkh5opitijbi	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988of001vwkh50rr33exj	L2-A01	Unit L2-A01	400	360	F&B	cmqt9894w002owkh5si36qbc4	800000	100000	UNDER_FITOUT	\N	\N	\N	\N	t	2026-06-25 08:42:53.583	2026-06-25 08:42:53.583	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98apg005cwkh5zt7l7swh	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988of001vwkh50rr33exj	L2-A02	Unit L2-A02	350	315	F&B	cmqt9894w002owkh5si36qbc4	800000	100000	UNDER_FITOUT	\N	\N	\N	\N	t	2026-06-25 08:42:53.62	2026-06-25 08:42:53.62	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aqt005ewkh5e8rijgzl	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988pd001xwkh5b911xx25	L2-B01	Unit L2-B01	500	450	Entertainment	cmqt9899o002swkh5zvgd0rrh	600000	80000	UNDER_FITOUT	\N	\N	\N	\N	t	2026-06-25 08:42:53.669	2026-06-25 08:42:53.669	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98arr005gwkh5tl3w4esd	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988qi001zwkh54m7co0b8	L2-C01	Unit L2-C01	120	108	F&B	cmqt9894w002owkh5si36qbc4	750000	90000	BOOKING	\N	\N	\N	\N	t	2026-06-25 08:42:53.703	2026-06-25 08:42:53.703	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98at5005iwkh5fob69bbx	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988qi001zwkh54m7co0b8	L2-C02	Unit L2-C02	160	144	Health & Beauty	cmqt9897m002qwkh5pblytvnr	750000	90000	BOOKING	\N	\N	\N	\N	t	2026-06-25 08:42:53.752	2026-06-25 08:42:53.752	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98auh005kwkh5j02puli9	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	cmqt988rf0021wkh5vddts1x9	L2-D01	Unit L2-D01	200	180	Fashion	cmqt9896h002pwkh51w9j3hb1	700000	85000	BOOKING	\N	\N	\N	\N	t	2026-06-25 08:42:53.801	2026-06-25 08:42:53.801	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98avl005mwkh5nk6aqjs9	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988ta0025wkh57dmp7k73	L3-A01	Unit L3-A01	800	720	Entertainment	cmqt9899o002swkh5zvgd0rrh	500000	70000	BOOKING	\N	\N	\N	\N	t	2026-06-25 08:42:53.841	2026-06-25 08:42:53.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98awr005owkh5kqe46ib2	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988vb0027wkh5bhlrpw2p	L3-B01	Unit L3-B01	250	225	F&B	cmqt9894w002owkh5si36qbc4	700000	85000	BOOKING	\N	\N	\N	\N	t	2026-06-25 08:42:53.883	2026-06-25 08:42:53.883	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98axw005qwkh5mr42iei8	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988vb0027wkh5bhlrpw2p	L3-B02	Unit L3-B02	300	270	F&B	cmqt9894w002owkh5si36qbc4	700000	85000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:53.924	2026-06-25 08:42:53.924	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98aza005swkh501t8wq3e	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988wb0029wkh5fra0j6bd	L3-C01	Unit L3-C01	150	135	Fashion	cmqt9896h002pwkh51w9j3hb1	650000	80000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:53.975	2026-06-25 08:42:53.975	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b0g005uwkh5w6zojczd	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988x9002bwkh5xwdk3xk0	L3-D01	Unit L3-D01	180	162	Technology	cmqt9898j002rwkh5wk8568uy	700000	85000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.016	2026-06-25 08:42:54.016	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b1m005wwkh5efm9fpbx	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	cmqt988ye002dwkh5cfl6ozr6	L3-E01	Unit L3-E01	220	198	Fashion	cmqt9896h002pwkh51w9j3hb1	650000	80000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.058	2026-06-25 08:42:54.058	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b2r005ywkh54alm7qht	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt988zb002fwkh5hzvq41uw	L4-A01	Unit L4-A01	1200	1080	Entertainment	cmqt9899o002swkh5zvgd0rrh	400000	60000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.099	2026-06-25 08:42:54.099	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b3x0060wkh5tnjzwjih	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt9890g002hwkh56o7mqyvi	L4-B01	Unit L4-B01	350	315	F&B	cmqt9894w002owkh5si36qbc4	600000	75000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.141	2026-06-25 08:42:54.141	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b520062wkh5zq4md46s	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt9890g002hwkh56o7mqyvi	L4-B02	Unit L4-B02	400	360	F&B	cmqt9894w002owkh5si36qbc4	600000	75000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.182	2026-06-25 08:42:54.182	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b680064wkh5arh0zk3k	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt9891m002jwkh55lgt4r2i	L4-C01	Unit L4-C01	200	180	Fashion	cmqt9896h002pwkh51w9j3hb1	550000	70000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.224	2026-06-25 08:42:54.224	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b7d0066wkh5aya74a8g	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt9892s002lwkh5eg52aub9	L4-D01	Unit L4-D01	160	144	F&B	cmqt9894w002owkh5si36qbc4	580000	72000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.266	2026-06-25 08:42:54.266	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cmqt98b8k0068wkh5tndas6m2	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	cmqt9893p002nwkh5j03bmgsl	L4-E01	Unit L4-E01	140	126	Health & Beauty	cmqt9897m002qwkh5pblytvnr	560000	70000	VACANT	\N	\N	\N	\N	t	2026-06-25 08:42:54.308	2026-06-25 08:42:54.308	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: UnitBooking; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnitBooking" (id, "bookingNumber", "unitId", "leadId", "customerId", status, priority, "requestedArea", "requestedTerm", "expectedRent", "holdDays", "expiresAt", "activatedAt", "convertedAt", "cancelledAt", "cancelReason", notes, "proposedRentPerSqm", "proposedCamPerSqm", "priceApprovalStatus", "priceApprovalNote", "priceApprovedById", "priceApprovedAt", "priceDeviationPercent", "createdById", "assignedToId", "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt98ct9008wwkh5vvgpjgv8	BK-2026-00001	cmqt98arr005gwkh5tl3w4esd	cmqt98bf1006kwkh5ppp3zvue	cmqt98a440049wkh5pysvmwcd	ACTIVE	1	150	36	1100000	30	2026-07-25 08:42:54.348	2026-06-22 08:42:54.348	\N	\N	\N	Starbucks đang thương thảo giá thuê tầng 2	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:56.35	2026-06-25 08:42:56.35
cmqt98cxe0090wkh5mopzq0xl	BK-2026-00002	cmqt98at5005iwkh5fob69bbx	cmqt98bnl006ywkh5g6m8p7w5	cmqt98a45004cwkh586rwbwtn	ACTIVE	1	200	24	850000	30	2026-07-25 08:42:54.348	2026-06-22 08:42:54.348	\N	\N	\N	Watsons đang chờ phê duyệt giá nội bộ	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:56.499	2026-06-25 08:42:56.499
cmqt98d0p0094wkh52hamw0ii	BK-2026-00003	cmqt98auh005kwkh5j02puli9	cmqt98bcy006gwkh5s495aeeo	cmqt98a46004dwkh5dstb7fpk	ACTIVE	1	300	36	800000	30	2026-07-25 08:42:54.348	2026-06-22 08:42:54.348	\N	\N	\N	Zara ưu tiên số 1	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:56.617	2026-06-25 08:42:56.617
cmqt98d4g0098wkh5x91t7tcp	BK-2026-00004	cmqt98auh005kwkh5j02puli9	cmqt98bhc006owkh5xlr6kob6	cmqt98a47004ewkh5lh79fbsw	PENDING	2	400	24	750000	30	2026-07-25 08:42:54.348	\N	\N	\N	\N	H&M chờ hàng — ưu tiên số 2	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:56.752	2026-06-25 08:42:56.752
cmqt98d7v009bwkh54f2z0ndw	BK-2026-00005	cmqt98avl005mwkh5nk6aqjs9	cmqt98cjj008ewkh5qek4op86	cmqt98a49004gwkh5gyn1zj9f	ACTIVE	1	2000	60	450000	45	2026-08-09 08:42:54.348	2026-06-22 08:42:54.348	\N	\N	\N	CGV đang đàm phán hợp đồng rạp phim	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:56.875	2026-06-25 08:42:56.875
cmqt98dbc009fwkh5slik65sr	BK-2026-00006	cmqt98awr005owkh5kqe46ib2	cmqt98c6u007uwkh58bg59z3j	cmqt98a4n004iwkh5wtayg8h8	ACTIVE	1	130	36	1000000	30	2026-07-25 08:42:54.348	2026-06-22 08:42:54.348	\N	\N	\N	Paris Baguette — đã chốt diện tích, chờ ký đề xuất	\N	\N	\N	\N	\N	\N	\N	cmqt987mh0001wkh5n3v0w9tq	cmqt987mh0001wkh5n3v0w9tq	t	2026-06-25 08:42:57	2026-06-25 08:42:57
\.


--
-- Data for Name: UnitHistory; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnitHistory" (id, "unitId", "changeType", "fieldName", "oldValue", "newValue", "changedById", notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: UnitImportLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnitImportLog" (id, "mallId", "fileName", "totalRows", "successRows", "failedRows", errors, status, "importedById", "createdAt", "completedAt") FROM stdin;
\.


--
-- Data for Name: UnitMedia; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnitMedia" (id, "unitId", type, "fileUrl", "fileName", "fileSize", "mimeType", caption, "sortOrder", "isCover", "uploadedById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: UnitSlot; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UnitSlot" (id, "unitId", code, name, area, description, "slotType", "pricePerDaySqm", "pricePerHour", "pricePerSqmMonth", "posX", "posY", "posW", "posH", "fillColor", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."User" (id, email, password, "fullName", role, phone, avatar, department, "isActive", "deletedAt", "createdAt", "updatedAt") FROM stdin;
cmqt987kn0000wkh5eie55vj6	admin@thiso.com	$2b$10$aBIJsLtrxODTIkncbzdrG.PqIqYf8ohQSpTW.61qIWf4N.SiJfX.6	System Administrator	ADMIN	0901234567	\N	IT	t	\N	2026-06-25 08:42:49.559	2026-06-25 08:42:49.559
cmqt987mh0001wkh5n3v0w9tq	executive@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Nguyen Van A	LEASING_EXECUTIVE	0901234568	\N	Leasing	t	\N	2026-06-25 08:42:49.625	2026-06-25 08:42:49.625
cmqt987ne0002wkh5jxwbedq2	manager@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Tran Thi B	LEASING_MANAGER	0901234569	\N	Leasing	t	\N	2026-06-25 08:42:49.658	2026-06-25 08:42:49.658
cmqt987oi0003wkh58oo99yj4	director@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Le Van C	MALL_DIRECTOR	0901234570	\N	Management	t	\N	2026-06-25 08:42:49.699	2026-06-25 08:42:49.699
cmqt987pp0004wkh5w0o8tqbi	finance@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Pham Thi D	FINANCE	0901234571	\N	Finance	t	\N	2026-06-25 08:42:49.741	2026-06-25 08:42:49.741
cmqt987rd0005wkh5jvdn76v3	legal@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Hoang Van E	LEGAL	0901234572	\N	Legal	t	\N	2026-06-25 08:42:49.801	2026-06-25 08:42:49.801
cmqt987si0006wkh56418hk6e	operation@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Vu Thi F	OPERATION	0901234573	\N	Operations	t	\N	2026-06-25 08:42:49.842	2026-06-25 08:42:49.842
cmqt987tm0007wkh5pa1xuchy	ceo@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Nguyen Minh G	CEO	0901234574	\N	Executive	t	\N	2026-06-25 08:42:49.883	2026-06-25 08:42:49.883
cmqt987us0008wkh5bmcyunai	tenant@thiso.com	$2b$10$k91qBgMlyELNLCY377IZt.t7S5Df02l92LO0BasxB/WbaCZMAFici	Tenant Portal User	TENANT	0901234575	\N	Tenant	t	\N	2026-06-25 08:42:49.924	2026-06-25 08:42:49.924
\.


--
-- Data for Name: UserMallAccess; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."UserMallAccess" (id, "userId", "mallId", role, "isActive", "grantedById", "createdAt", "updatedAt") FROM stdin;
cmqt98qdw00umwkh5r4nss3s3	cmqt987kn0000wkh5eie55vj6	cmqt9883d000xwkh5vdlw2qsa	ADMIN	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.941	2026-06-25 08:43:13.941
cmqt98qdw00unwkh5aphv5j02	cmqt987tm0007wkh5pa1xuchy	cmqt9883d000xwkh5vdlw2qsa	CEO	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.941	2026-06-25 08:43:13.941
cmqt98qdw00uowkh5nyg0zgg2	cmqt987oi0003wkh58oo99yj4	cmqt9883d000xwkh5vdlw2qsa	MALL_DIRECTOR	t	cmqt987kn0000wkh5eie55vj6	2026-06-25 08:43:13.941	2026-06-25 08:43:13.941
\.


--
-- Data for Name: WorkerAccessLog; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."WorkerAccessLog" (id, "projectId", "contractorId", "workerName", "idNumber", "entryDate", "exitDate", purpose, "createdAt") FROM stdin;
cmqt98qil00uuwkh5c1ondwf7	cmqt98e7s00atwkh5cx14ptrn	cmqt98qhh00utwkh5ck49gspf	Trần Văn A	001234567890	2024-03-01 01:00:00	2024-03-01 10:30:00	Lắp đặt hệ thống điện	2026-06-25 08:43:14.109
cmqt98qil00uvwkh5d4fzk85i	cmqt98e7s00atwkh5cx14ptrn	cmqt98qhh00utwkh5ck49gspf	Lê Văn B	001234567891	2024-03-01 01:15:00	2024-03-01 10:30:00	Lắp đặt hệ thống điện	2026-06-25 08:43:14.109
\.


--
-- Data for Name: Zone; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public."Zone" (id, "mallId", "buildingId", "floorId", name, code, "isActive", "createdAt", "updatedAt") FROM stdin;
cmqt988b0001bwkh5jbamsufg	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	Zone A	GF-A	t	2026-06-25 08:42:50.508	2026-06-25 08:42:50.508
cmqt988bw001dwkh585v1ouid	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	Zone B	GF-B	t	2026-06-25 08:42:50.541	2026-06-25 08:42:50.541
cmqt988d2001fwkh54t7qqmqj	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	Zone C	GF-C	t	2026-06-25 08:42:50.582	2026-06-25 08:42:50.582
cmqt988e1001hwkh5dr15mhyk	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	Zone D	GF-D	t	2026-06-25 08:42:50.617	2026-06-25 08:42:50.617
cmqt988ey001jwkh57lfwd7bl	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9885u0011wkh5dzy8mesq	Zone E	GF-E	t	2026-06-25 08:42:50.65	2026-06-25 08:42:50.65
cmqt988hb001lwkh50f67ahqh	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	Zone A	L1-A	t	2026-06-25 08:42:50.735	2026-06-25 08:42:50.735
cmqt988if001nwkh53lrpgh3v	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	Zone B	L1-B	t	2026-06-25 08:42:50.775	2026-06-25 08:42:50.775
cmqt988jz001pwkh5xxr8h4dx	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	Zone C	L1-C	t	2026-06-25 08:42:50.832	2026-06-25 08:42:50.832
cmqt988lv001rwkh5llmhl7wx	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	Zone D	L1-D	t	2026-06-25 08:42:50.899	2026-06-25 08:42:50.899
cmqt988ni001twkh512fhdo2z	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0016wkh58yqnkudx	Zone E	L1-E	t	2026-06-25 08:42:50.958	2026-06-25 08:42:50.958
cmqt988of001vwkh50rr33exj	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	Zone A	L2-A	t	2026-06-25 08:42:50.991	2026-06-25 08:42:50.991
cmqt988pd001xwkh5b911xx25	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	Zone B	L2-B	t	2026-06-25 08:42:51.025	2026-06-25 08:42:51.025
cmqt988qi001zwkh54m7co0b8	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	Zone C	L2-C	t	2026-06-25 08:42:51.066	2026-06-25 08:42:51.066
cmqt988rf0021wkh5vddts1x9	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	Zone D	L2-D	t	2026-06-25 08:42:51.099	2026-06-25 08:42:51.099
cmqt988sc0023wkh5bybk2vku	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9888q0013wkh56x4oqj5q	Zone E	L2-E	t	2026-06-25 08:42:51.132	2026-06-25 08:42:51.132
cmqt988ta0025wkh57dmp7k73	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	Zone A	L3-A	t	2026-06-25 08:42:51.166	2026-06-25 08:42:51.166
cmqt988vb0027wkh5bhlrpw2p	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	Zone B	L3-B	t	2026-06-25 08:42:51.239	2026-06-25 08:42:51.239
cmqt988wb0029wkh5fra0j6bd	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	Zone C	L3-C	t	2026-06-25 08:42:51.275	2026-06-25 08:42:51.275
cmqt988x9002bwkh5xwdk3xk0	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	Zone D	L3-D	t	2026-06-25 08:42:51.309	2026-06-25 08:42:51.309
cmqt988ye002dwkh5cfl6ozr6	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889b0017wkh5odhu6594	Zone E	L3-E	t	2026-06-25 08:42:51.35	2026-06-25 08:42:51.35
cmqt988zb002fwkh5hzvq41uw	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	Zone A	L4-A	t	2026-06-25 08:42:51.383	2026-06-25 08:42:51.383
cmqt9890g002hwkh56o7mqyvi	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	Zone B	L4-B	t	2026-06-25 08:42:51.424	2026-06-25 08:42:51.424
cmqt9891m002jwkh55lgt4r2i	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	Zone C	L4-C	t	2026-06-25 08:42:51.466	2026-06-25 08:42:51.466
cmqt9892s002lwkh5eg52aub9	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	Zone D	L4-D	t	2026-06-25 08:42:51.508	2026-06-25 08:42:51.508
cmqt9893p002nwkh5j03bmgsl	cmqt9883d000xwkh5vdlw2qsa	cmqt9884m000zwkh54qxb0m8c	cmqt9889d0019wkh5h6hsmpa0	Zone E	L4-E	t	2026-06-25 08:42:51.541	2026-06-25 08:42:51.541
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: leasing
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
8a4225cf-0580-41c9-97dc-ab80fc6184ed	b21881a5c280f1079b283b2de117122f1d8b9c7c87c95b3e3e5976ddbea8edae	2026-06-25 15:39:20.41626+07	20250621000000_init	\N	\N	2026-06-25 15:39:05.925928+07	1
\.


--
-- Name: ApprovalPolicyRule ApprovalPolicyRule_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalPolicyRule"
    ADD CONSTRAINT "ApprovalPolicyRule_pkey" PRIMARY KEY (id);


--
-- Name: ApprovalStep ApprovalStep_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalStep"
    ADD CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY (id);


--
-- Name: ApprovalWorkflow ApprovalWorkflow_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalWorkflow"
    ADD CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY (id);


--
-- Name: ArDunningLog ArDunningLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ArDunningLog"
    ADD CONSTRAINT "ArDunningLog_pkey" PRIMARY KEY (id);


--
-- Name: ArDunningPolicy ArDunningPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ArDunningPolicy"
    ADD CONSTRAINT "ArDunningPolicy_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: BankStatement BankStatement_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BankStatement"
    ADD CONSTRAINT "BankStatement_pkey" PRIMARY KEY (id);


--
-- Name: BillingConfig BillingConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BillingConfig"
    ADD CONSTRAINT "BillingConfig_pkey" PRIMARY KEY (id);


--
-- Name: BillingScheduleEntry BillingScheduleEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BillingScheduleEntry"
    ADD CONSTRAINT "BillingScheduleEntry_pkey" PRIMARY KEY (id);


--
-- Name: BookingActivity BookingActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BookingActivity"
    ADD CONSTRAINT "BookingActivity_pkey" PRIMARY KEY (id);


--
-- Name: Building Building_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Building"
    ADD CONSTRAINT "Building_pkey" PRIMARY KEY (id);


--
-- Name: CategoryMallPricing CategoryMallPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: ComplianceExport ComplianceExport_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ComplianceExport"
    ADD CONSTRAINT "ComplianceExport_pkey" PRIMARY KEY (id);


--
-- Name: ContractAmendment ContractAmendment_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractAmendment"
    ADD CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY (id);


--
-- Name: ContractClause ContractClause_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractClause"
    ADD CONSTRAINT "ContractClause_pkey" PRIMARY KEY (id);


--
-- Name: ContractEvent ContractEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractEvent"
    ADD CONSTRAINT "ContractEvent_pkey" PRIMARY KEY (id);


--
-- Name: ContractFile ContractFile_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractFile"
    ADD CONSTRAINT "ContractFile_pkey" PRIMARY KEY (id);


--
-- Name: ContractTemplate ContractTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractTemplate"
    ADD CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY (id);


--
-- Name: ContractTermination ContractTermination_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractTermination"
    ADD CONSTRAINT "ContractTermination_pkey" PRIMARY KEY (id);


--
-- Name: Contract Contract_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_pkey" PRIMARY KEY (id);


--
-- Name: CustomerActivity CustomerActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CustomerActivity"
    ADD CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: DealScoreCriterion DealScoreCriterion_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DealScoreCriterion"
    ADD CONSTRAINT "DealScoreCriterion_pkey" PRIMARY KEY (id);


--
-- Name: DepositAccount DepositAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DepositAccount"
    ADD CONSTRAINT "DepositAccount_pkey" PRIMARY KEY (id);


--
-- Name: DocumentDownloadLog DocumentDownloadLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DocumentDownloadLog"
    ADD CONSTRAINT "DocumentDownloadLog_pkey" PRIMARY KEY (id);


--
-- Name: FitoutChecklist FitoutChecklist_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutChecklist"
    ADD CONSTRAINT "FitoutChecklist_pkey" PRIMARY KEY (id);


--
-- Name: FitoutContractor FitoutContractor_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutContractor"
    ADD CONSTRAINT "FitoutContractor_pkey" PRIMARY KEY (id);


--
-- Name: FitoutDocumentGate FitoutDocumentGate_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutDocumentGate"
    ADD CONSTRAINT "FitoutDocumentGate_pkey" PRIMARY KEY (id);


--
-- Name: FitoutDocument FitoutDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutDocument"
    ADD CONSTRAINT "FitoutDocument_pkey" PRIMARY KEY (id);


--
-- Name: FitoutMilestone FitoutMilestone_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutMilestone"
    ADD CONSTRAINT "FitoutMilestone_pkey" PRIMARY KEY (id);


--
-- Name: FitoutProject FitoutProject_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutProject"
    ADD CONSTRAINT "FitoutProject_pkey" PRIMARY KEY (id);


--
-- Name: FitoutSlaPolicy FitoutSlaPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutSlaPolicy"
    ADD CONSTRAINT "FitoutSlaPolicy_pkey" PRIMARY KEY (id);


--
-- Name: FloorPlanAnalysis FloorPlanAnalysis_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FloorPlanAnalysis"
    ADD CONSTRAINT "FloorPlanAnalysis_pkey" PRIMARY KEY (id);


--
-- Name: Floor Floor_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Floor"
    ADD CONSTRAINT "Floor_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceLine InvoiceLine_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."InvoiceLine"
    ADD CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY (id);


--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);


--
-- Name: LeadActivity LeadActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadActivity"
    ADD CONSTRAINT "LeadActivity_pkey" PRIMARY KEY (id);


--
-- Name: LeadContact LeadContact_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadContact"
    ADD CONSTRAINT "LeadContact_pkey" PRIMARY KEY (id);


--
-- Name: LeadFollowUp LeadFollowUp_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY (id);


--
-- Name: Lead Lead_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);


--
-- Name: MaintenanceSchedule MaintenanceSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY (id);


--
-- Name: MallAnnouncement MallAnnouncement_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MallAnnouncement"
    ADD CONSTRAINT "MallAnnouncement_pkey" PRIMARY KEY (id);


--
-- Name: MallPolicy MallPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MallPolicy"
    ADD CONSTRAINT "MallPolicy_pkey" PRIMARY KEY (id);


--
-- Name: Mall Mall_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Mall"
    ADD CONSTRAINT "Mall_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OccupancySnapshot OccupancySnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."OccupancySnapshot"
    ADD CONSTRAINT "OccupancySnapshot_pkey" PRIMARY KEY (id);


--
-- Name: PaymentReconciliation PaymentReconciliation_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."PaymentReconciliation"
    ADD CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: PenaltyInterestPolicy PenaltyInterestPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."PenaltyInterestPolicy"
    ADD CONSTRAINT "PenaltyInterestPolicy_pkey" PRIMARY KEY (id);


--
-- Name: ProposalDealScore ProposalDealScore_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalDealScore"
    ADD CONSTRAINT "ProposalDealScore_pkey" PRIMARY KEY (id);


--
-- Name: ProposalNegotiationRound ProposalNegotiationRound_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalNegotiationRound"
    ADD CONSTRAINT "ProposalNegotiationRound_pkey" PRIMARY KEY (id);


--
-- Name: ProposalScenario ProposalScenario_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalScenario"
    ADD CONSTRAINT "ProposalScenario_pkey" PRIMARY KEY (id);


--
-- Name: ProposalVersion ProposalVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalVersion"
    ADD CONSTRAINT "ProposalVersion_pkey" PRIMARY KEY (id);


--
-- Name: Proposal Proposal_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Proposal"
    ADD CONSTRAINT "Proposal_pkey" PRIMARY KEY (id);


--
-- Name: RenewalRiskScore RenewalRiskScore_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."RenewalRiskScore"
    ADD CONSTRAINT "RenewalRiskScore_pkey" PRIMARY KEY (id);


--
-- Name: SalesAuditTrail SalesAuditTrail_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesAuditTrail"
    ADD CONSTRAINT "SalesAuditTrail_pkey" PRIMARY KEY (id);


--
-- Name: SalesTurnover SalesTurnover_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesTurnover"
    ADD CONSTRAINT "SalesTurnover_pkey" PRIMARY KEY (id);


--
-- Name: SapEntityMapping SapEntityMapping_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SapEntityMapping"
    ADD CONSTRAINT "SapEntityMapping_pkey" PRIMARY KEY (id);


--
-- Name: SapIntegrationLog SapIntegrationLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SapIntegrationLog"
    ADD CONSTRAINT "SapIntegrationLog_pkey" PRIMARY KEY (id);


--
-- Name: SapReconciliationRecord SapReconciliationRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SapReconciliationRecord"
    ADD CONSTRAINT "SapReconciliationRecord_pkey" PRIMARY KEY (id);


--
-- Name: SlotBooking SlotBooking_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotBooking"
    ADD CONSTRAINT "SlotBooking_pkey" PRIMARY KEY (id);


--
-- Name: SlotPricingRule SlotPricingRule_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotPricingRule"
    ADD CONSTRAINT "SlotPricingRule_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: TicketComment TicketComment_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketComment"
    ADD CONSTRAINT "TicketComment_pkey" PRIMARY KEY (id);


--
-- Name: TicketEscalation TicketEscalation_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketEscalation"
    ADD CONSTRAINT "TicketEscalation_pkey" PRIMARY KEY (id);


--
-- Name: TicketFile TicketFile_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketFile"
    ADD CONSTRAINT "TicketFile_pkey" PRIMARY KEY (id);


--
-- Name: TicketRating TicketRating_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketRating"
    ADD CONSTRAINT "TicketRating_pkey" PRIMARY KEY (id);


--
-- Name: TicketSlaPolicy TicketSlaPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketSlaPolicy"
    ADD CONSTRAINT "TicketSlaPolicy_pkey" PRIMARY KEY (id);


--
-- Name: Ticket Ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY (id);


--
-- Name: UnifiedDocument UnifiedDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnifiedDocument"
    ADD CONSTRAINT "UnifiedDocument_pkey" PRIMARY KEY (id);


--
-- Name: UnitBooking UnitBooking_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_pkey" PRIMARY KEY (id);


--
-- Name: UnitHistory UnitHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitHistory"
    ADD CONSTRAINT "UnitHistory_pkey" PRIMARY KEY (id);


--
-- Name: UnitImportLog UnitImportLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitImportLog"
    ADD CONSTRAINT "UnitImportLog_pkey" PRIMARY KEY (id);


--
-- Name: UnitMedia UnitMedia_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitMedia"
    ADD CONSTRAINT "UnitMedia_pkey" PRIMARY KEY (id);


--
-- Name: UnitSlot UnitSlot_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitSlot"
    ADD CONSTRAINT "UnitSlot_pkey" PRIMARY KEY (id);


--
-- Name: Unit Unit_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_pkey" PRIMARY KEY (id);


--
-- Name: UserMallAccess UserMallAccess_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UserMallAccess"
    ADD CONSTRAINT "UserMallAccess_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: WorkerAccessLog WorkerAccessLog_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."WorkerAccessLog"
    ADD CONSTRAINT "WorkerAccessLog_pkey" PRIMARY KEY (id);


--
-- Name: Zone Zone_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Zone"
    ADD CONSTRAINT "Zone_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ApprovalPolicyRule_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ApprovalPolicyRule_code_key" ON public."ApprovalPolicyRule" USING btree (code);


--
-- Name: ApprovalPolicyRule_isActive_stepOrder_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ApprovalPolicyRule_isActive_stepOrder_idx" ON public."ApprovalPolicyRule" USING btree ("isActive", "stepOrder");


--
-- Name: ApprovalWorkflow_proposalId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ApprovalWorkflow_proposalId_key" ON public."ApprovalWorkflow" USING btree ("proposalId");


--
-- Name: ArDunningLog_invoiceId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ArDunningLog_invoiceId_idx" ON public."ArDunningLog" USING btree ("invoiceId");


--
-- Name: ArDunningLog_invoiceId_policyId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ArDunningLog_invoiceId_policyId_key" ON public."ArDunningLog" USING btree ("invoiceId", "policyId");


--
-- Name: ArDunningPolicy_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ArDunningPolicy_code_key" ON public."ArDunningPolicy" USING btree (code);


--
-- Name: ArDunningPolicy_isActive_level_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ArDunningPolicy_isActive_level_idx" ON public."ArDunningPolicy" USING btree ("isActive", level);


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: AuditLog_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "AuditLog_entityType_entityId_idx" ON public."AuditLog" USING btree ("entityType", "entityId");


--
-- Name: AuditLog_userId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "AuditLog_userId_idx" ON public."AuditLog" USING btree ("userId");


--
-- Name: BankStatement_mallId_statementDate_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "BankStatement_mallId_statementDate_idx" ON public."BankStatement" USING btree ("mallId", "statementDate");


--
-- Name: BillingScheduleEntry_contractId_period_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "BillingScheduleEntry_contractId_period_key" ON public."BillingScheduleEntry" USING btree ("contractId", period);


--
-- Name: BillingScheduleEntry_invoiceId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "BillingScheduleEntry_invoiceId_key" ON public."BillingScheduleEntry" USING btree ("invoiceId");


--
-- Name: BillingScheduleEntry_status_dueDate_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "BillingScheduleEntry_status_dueDate_idx" ON public."BillingScheduleEntry" USING btree (status, "dueDate");


--
-- Name: BookingActivity_bookingId_createdAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "BookingActivity_bookingId_createdAt_idx" ON public."BookingActivity" USING btree ("bookingId", "createdAt");


--
-- Name: CategoryMallPricing_effectiveFrom_effectiveTo_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "CategoryMallPricing_effectiveFrom_effectiveTo_idx" ON public."CategoryMallPricing" USING btree ("effectiveFrom", "effectiveTo");


--
-- Name: CategoryMallPricing_mallId_categoryId_floorId_zoneId_effect_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "CategoryMallPricing_mallId_categoryId_floorId_zoneId_effect_key" ON public."CategoryMallPricing" USING btree ("mallId", "categoryId", "floorId", "zoneId", "effectiveFrom");


--
-- Name: CategoryMallPricing_mallId_categoryId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "CategoryMallPricing_mallId_categoryId_isActive_idx" ON public."CategoryMallPricing" USING btree ("mallId", "categoryId", "isActive");


--
-- Name: Category_code_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Category_code_idx" ON public."Category" USING btree (code);


--
-- Name: Category_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Category_code_key" ON public."Category" USING btree (code);


--
-- Name: Category_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Category_isActive_sortOrder_idx" ON public."Category" USING btree ("isActive", "sortOrder");


--
-- Name: Category_parentId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Category_parentId_idx" ON public."Category" USING btree ("parentId");


--
-- Name: ComplianceExport_exportType_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ComplianceExport_exportType_status_idx" ON public."ComplianceExport" USING btree ("exportType", status);


--
-- Name: ContractAmendment_amendmentNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ContractAmendment_amendmentNumber_key" ON public."ContractAmendment" USING btree ("amendmentNumber");


--
-- Name: ContractAmendment_contractId_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ContractAmendment_contractId_status_idx" ON public."ContractAmendment" USING btree ("contractId", status);


--
-- Name: ContractClause_templateId_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ContractClause_templateId_code_key" ON public."ContractClause" USING btree ("templateId", code);


--
-- Name: ContractEvent_contractId_createdAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ContractEvent_contractId_createdAt_idx" ON public."ContractEvent" USING btree ("contractId", "createdAt");


--
-- Name: ContractFile_verifyCode_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ContractFile_verifyCode_key" ON public."ContractFile" USING btree ("verifyCode");


--
-- Name: ContractTemplate_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ContractTemplate_code_key" ON public."ContractTemplate" USING btree (code);


--
-- Name: ContractTermination_contractId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ContractTermination_contractId_key" ON public."ContractTermination" USING btree ("contractId");


--
-- Name: Contract_contractNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Contract_contractNumber_key" ON public."Contract" USING btree ("contractNumber");


--
-- Name: Contract_proposalId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Contract_proposalId_key" ON public."Contract" USING btree ("proposalId");


--
-- Name: Customer_customerCode_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Customer_customerCode_key" ON public."Customer" USING btree ("customerCode");


--
-- Name: DealScoreCriterion_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "DealScoreCriterion_code_key" ON public."DealScoreCriterion" USING btree (code);


--
-- Name: DepositAccount_contractId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "DepositAccount_contractId_key" ON public."DepositAccount" USING btree ("contractId");


--
-- Name: DepositAccount_tenantId_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "DepositAccount_tenantId_status_idx" ON public."DepositAccount" USING btree ("tenantId", status);


--
-- Name: DocumentDownloadLog_documentId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "DocumentDownloadLog_documentId_idx" ON public."DocumentDownloadLog" USING btree ("documentId");


--
-- Name: DocumentDownloadLog_userId_downloadedAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "DocumentDownloadLog_userId_downloadedAt_idx" ON public."DocumentDownloadLog" USING btree ("userId", "downloadedAt");


--
-- Name: FitoutContractor_projectId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "FitoutContractor_projectId_isActive_idx" ON public."FitoutContractor" USING btree ("projectId", "isActive");


--
-- Name: FitoutDocumentGate_stage_documentType_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "FitoutDocumentGate_stage_documentType_key" ON public."FitoutDocumentGate" USING btree (stage, "documentType");


--
-- Name: FitoutDocument_projectId_documentType_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "FitoutDocument_projectId_documentType_idx" ON public."FitoutDocument" USING btree ("projectId", "documentType");


--
-- Name: FitoutMilestone_isOverdue_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "FitoutMilestone_isOverdue_idx" ON public."FitoutMilestone" USING btree ("isOverdue");


--
-- Name: FitoutMilestone_projectId_stage_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "FitoutMilestone_projectId_stage_key" ON public."FitoutMilestone" USING btree ("projectId", stage);


--
-- Name: FitoutProject_contractId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "FitoutProject_contractId_key" ON public."FitoutProject" USING btree ("contractId");


--
-- Name: FitoutSlaPolicy_stage_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "FitoutSlaPolicy_stage_key" ON public."FitoutSlaPolicy" USING btree (stage);


--
-- Name: Invoice_invoiceNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON public."Invoice" USING btree ("invoiceNumber");


--
-- Name: LeadContact_leadId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "LeadContact_leadId_idx" ON public."LeadContact" USING btree ("leadId");


--
-- Name: LeadFollowUp_assignedToId_isDone_dueDate_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "LeadFollowUp_assignedToId_isDone_dueDate_idx" ON public."LeadFollowUp" USING btree ("assignedToId", "isDone", "dueDate");


--
-- Name: LeadFollowUp_dueDate_isDone_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "LeadFollowUp_dueDate_isDone_idx" ON public."LeadFollowUp" USING btree ("dueDate", "isDone");


--
-- Name: Lead_status_priority_position_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Lead_status_priority_position_idx" ON public."Lead" USING btree (status, priority, "position");


--
-- Name: MaintenanceSchedule_mallId_nextDueDate_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "MaintenanceSchedule_mallId_nextDueDate_isActive_idx" ON public."MaintenanceSchedule" USING btree ("mallId", "nextDueDate", "isActive");


--
-- Name: MallAnnouncement_mallId_isActive_publishedAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "MallAnnouncement_mallId_isActive_publishedAt_idx" ON public."MallAnnouncement" USING btree ("mallId", "isActive", "publishedAt");


--
-- Name: MallPolicy_mallId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "MallPolicy_mallId_key" ON public."MallPolicy" USING btree ("mallId");


--
-- Name: Mall_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Mall_code_key" ON public."Mall" USING btree (code);


--
-- Name: OccupancySnapshot_mallId_floorId_category_period_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "OccupancySnapshot_mallId_floorId_category_period_key" ON public."OccupancySnapshot" USING btree ("mallId", "floorId", category, period);


--
-- Name: OccupancySnapshot_mallId_period_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "OccupancySnapshot_mallId_period_idx" ON public."OccupancySnapshot" USING btree ("mallId", period);


--
-- Name: PaymentReconciliation_bankStatementId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "PaymentReconciliation_bankStatementId_idx" ON public."PaymentReconciliation" USING btree ("bankStatementId");


--
-- Name: PaymentReconciliation_paymentId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "PaymentReconciliation_paymentId_key" ON public."PaymentReconciliation" USING btree ("paymentId");


--
-- Name: PaymentReconciliation_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "PaymentReconciliation_status_idx" ON public."PaymentReconciliation" USING btree (status);


--
-- Name: PenaltyInterestPolicy_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "PenaltyInterestPolicy_code_key" ON public."PenaltyInterestPolicy" USING btree (code);


--
-- Name: ProposalDealScore_proposalId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ProposalDealScore_proposalId_key" ON public."ProposalDealScore" USING btree ("proposalId");


--
-- Name: ProposalNegotiationRound_proposalId_roundNumber_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ProposalNegotiationRound_proposalId_roundNumber_idx" ON public."ProposalNegotiationRound" USING btree ("proposalId", "roundNumber");


--
-- Name: ProposalScenario_proposalId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ProposalScenario_proposalId_idx" ON public."ProposalScenario" USING btree ("proposalId");


--
-- Name: ProposalVersion_proposalId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "ProposalVersion_proposalId_idx" ON public."ProposalVersion" USING btree ("proposalId");


--
-- Name: ProposalVersion_proposalId_version_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "ProposalVersion_proposalId_version_key" ON public."ProposalVersion" USING btree ("proposalId", version);


--
-- Name: Proposal_bookingId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Proposal_bookingId_key" ON public."Proposal" USING btree ("bookingId");


--
-- Name: Proposal_proposalNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Proposal_proposalNumber_key" ON public."Proposal" USING btree ("proposalNumber");


--
-- Name: RenewalRiskScore_contractId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "RenewalRiskScore_contractId_key" ON public."RenewalRiskScore" USING btree ("contractId");


--
-- Name: RenewalRiskScore_riskLevel_daysToExpiry_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "RenewalRiskScore_riskLevel_daysToExpiry_idx" ON public."RenewalRiskScore" USING btree ("riskLevel", "daysToExpiry");


--
-- Name: SalesAuditTrail_salesId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SalesAuditTrail_salesId_idx" ON public."SalesAuditTrail" USING btree ("salesId");


--
-- Name: SalesTurnover_tenantId_unitId_period_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "SalesTurnover_tenantId_unitId_period_key" ON public."SalesTurnover" USING btree ("tenantId", "unitId", period);


--
-- Name: SapEntityMapping_entityType_entityId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "SapEntityMapping_entityType_entityId_key" ON public."SapEntityMapping" USING btree ("entityType", "entityId");


--
-- Name: SapEntityMapping_entityType_syncStatus_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SapEntityMapping_entityType_syncStatus_idx" ON public."SapEntityMapping" USING btree ("entityType", "syncStatus");


--
-- Name: SapIntegrationLog_idempotencyKey_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "SapIntegrationLog_idempotencyKey_key" ON public."SapIntegrationLog" USING btree ("idempotencyKey");


--
-- Name: SapReconciliationRecord_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SapReconciliationRecord_entityType_entityId_idx" ON public."SapReconciliationRecord" USING btree ("entityType", "entityId");


--
-- Name: SapReconciliationRecord_idempotencyKey_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "SapReconciliationRecord_idempotencyKey_key" ON public."SapReconciliationRecord" USING btree ("idempotencyKey");


--
-- Name: SapReconciliationRecord_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SapReconciliationRecord_status_idx" ON public."SapReconciliationRecord" USING btree (status);


--
-- Name: SlotBooking_bookingRef_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "SlotBooking_bookingRef_key" ON public."SlotBooking" USING btree ("bookingRef");


--
-- Name: SlotBooking_slotId_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SlotBooking_slotId_status_idx" ON public."SlotBooking" USING btree ("slotId", status);


--
-- Name: SlotBooking_startDatetime_endDatetime_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SlotBooking_startDatetime_endDatetime_idx" ON public."SlotBooking" USING btree ("startDatetime", "endDatetime");


--
-- Name: SlotPricingRule_slotId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "SlotPricingRule_slotId_isActive_idx" ON public."SlotPricingRule" USING btree ("slotId", "isActive");


--
-- Name: Tenant_portalEmail_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Tenant_portalEmail_key" ON public."Tenant" USING btree ("portalEmail");


--
-- Name: Tenant_taxCode_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Tenant_taxCode_key" ON public."Tenant" USING btree ("taxCode");


--
-- Name: TicketEscalation_ticketId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "TicketEscalation_ticketId_idx" ON public."TicketEscalation" USING btree ("ticketId");


--
-- Name: TicketRating_rating_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "TicketRating_rating_idx" ON public."TicketRating" USING btree (rating);


--
-- Name: TicketRating_ticketId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "TicketRating_ticketId_key" ON public."TicketRating" USING btree ("ticketId");


--
-- Name: TicketSlaPolicy_ticketType_priority_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "TicketSlaPolicy_ticketType_priority_key" ON public."TicketSlaPolicy" USING btree ("ticketType", priority);


--
-- Name: Ticket_slaDueAt_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Ticket_slaDueAt_status_idx" ON public."Ticket" USING btree ("slaDueAt", status);


--
-- Name: Ticket_ticketNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON public."Ticket" USING btree ("ticketNumber");


--
-- Name: UnifiedDocument_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnifiedDocument_entityType_entityId_idx" ON public."UnifiedDocument" USING btree ("entityType", "entityId");


--
-- Name: UnifiedDocument_mallId_documentType_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnifiedDocument_mallId_documentType_idx" ON public."UnifiedDocument" USING btree ("mallId", "documentType");


--
-- Name: UnifiedDocument_uploadedAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnifiedDocument_uploadedAt_idx" ON public."UnifiedDocument" USING btree ("uploadedAt");


--
-- Name: UnitBooking_bookingNumber_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "UnitBooking_bookingNumber_key" ON public."UnitBooking" USING btree ("bookingNumber");


--
-- Name: UnitBooking_customerId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitBooking_customerId_idx" ON public."UnitBooking" USING btree ("customerId");


--
-- Name: UnitBooking_leadId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitBooking_leadId_idx" ON public."UnitBooking" USING btree ("leadId");


--
-- Name: UnitBooking_priceApprovalStatus_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitBooking_priceApprovalStatus_idx" ON public."UnitBooking" USING btree ("priceApprovalStatus");


--
-- Name: UnitBooking_status_expiresAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitBooking_status_expiresAt_idx" ON public."UnitBooking" USING btree (status, "expiresAt");


--
-- Name: UnitBooking_unitId_status_priority_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitBooking_unitId_status_priority_idx" ON public."UnitBooking" USING btree ("unitId", status, priority);


--
-- Name: UnitHistory_changeType_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitHistory_changeType_idx" ON public."UnitHistory" USING btree ("changeType");


--
-- Name: UnitHistory_unitId_createdAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitHistory_unitId_createdAt_idx" ON public."UnitHistory" USING btree ("unitId", "createdAt");


--
-- Name: UnitImportLog_mallId_createdAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitImportLog_mallId_createdAt_idx" ON public."UnitImportLog" USING btree ("mallId", "createdAt");


--
-- Name: UnitMedia_unitId_type_sortOrder_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitMedia_unitId_type_sortOrder_idx" ON public."UnitMedia" USING btree ("unitId", type, "sortOrder");


--
-- Name: UnitSlot_unitId_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "UnitSlot_unitId_code_key" ON public."UnitSlot" USING btree ("unitId", code);


--
-- Name: UnitSlot_unitId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UnitSlot_unitId_isActive_idx" ON public."UnitSlot" USING btree ("unitId", "isActive");


--
-- Name: Unit_category_status_mallId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_category_status_mallId_idx" ON public."Unit" USING btree (category, status, "mallId");


--
-- Name: Unit_floorId_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_floorId_status_idx" ON public."Unit" USING btree ("floorId", status);


--
-- Name: Unit_leaseEndDate_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_leaseEndDate_idx" ON public."Unit" USING btree ("leaseEndDate");


--
-- Name: Unit_mallId_code_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "Unit_mallId_code_key" ON public."Unit" USING btree ("mallId", code);


--
-- Name: Unit_mallId_status_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_mallId_status_idx" ON public."Unit" USING btree ("mallId", status);


--
-- Name: Unit_status_areaNLA_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_status_areaNLA_idx" ON public."Unit" USING btree (status, "areaNLA");


--
-- Name: Unit_status_updatedAt_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_status_updatedAt_idx" ON public."Unit" USING btree (status, "updatedAt");


--
-- Name: Unit_vacantSince_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "Unit_vacantSince_idx" ON public."Unit" USING btree ("vacantSince");


--
-- Name: UserMallAccess_mallId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UserMallAccess_mallId_isActive_idx" ON public."UserMallAccess" USING btree ("mallId", "isActive");


--
-- Name: UserMallAccess_userId_isActive_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "UserMallAccess_userId_isActive_idx" ON public."UserMallAccess" USING btree ("userId", "isActive");


--
-- Name: UserMallAccess_userId_mallId_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "UserMallAccess_userId_mallId_key" ON public."UserMallAccess" USING btree ("userId", "mallId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: leasing
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: WorkerAccessLog_contractorId_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "WorkerAccessLog_contractorId_idx" ON public."WorkerAccessLog" USING btree ("contractorId");


--
-- Name: WorkerAccessLog_projectId_entryDate_idx; Type: INDEX; Schema: public; Owner: leasing
--

CREATE INDEX "WorkerAccessLog_projectId_entryDate_idx" ON public."WorkerAccessLog" USING btree ("projectId", "entryDate");


--
-- Name: ApprovalStep ApprovalStep_approverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalStep"
    ADD CONSTRAINT "ApprovalStep_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ApprovalStep ApprovalStep_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalStep"
    ADD CONSTRAINT "ApprovalStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public."ApprovalWorkflow"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ApprovalWorkflow ApprovalWorkflow_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ApprovalWorkflow"
    ADD CONSTRAINT "ApprovalWorkflow_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ArDunningLog ArDunningLog_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ArDunningLog"
    ADD CONSTRAINT "ArDunningLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ArDunningLog ArDunningLog_policyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ArDunningLog"
    ADD CONSTRAINT "ArDunningLog_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES public."ArDunningPolicy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BankStatement BankStatement_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BankStatement"
    ADD CONSTRAINT "BankStatement_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: BillingScheduleEntry BillingScheduleEntry_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BillingScheduleEntry"
    ADD CONSTRAINT "BillingScheduleEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingScheduleEntry BillingScheduleEntry_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BillingScheduleEntry"
    ADD CONSTRAINT "BillingScheduleEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BookingActivity BookingActivity_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BookingActivity"
    ADD CONSTRAINT "BookingActivity_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."UnitBooking"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BookingActivity BookingActivity_performedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."BookingActivity"
    ADD CONSTRAINT "BookingActivity_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Building Building_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Building"
    ADD CONSTRAINT "Building_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CategoryMallPricing CategoryMallPricing_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CategoryMallPricing CategoryMallPricing_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CategoryMallPricing CategoryMallPricing_floorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES public."Floor"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CategoryMallPricing CategoryMallPricing_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CategoryMallPricing CategoryMallPricing_zoneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CategoryMallPricing"
    ADD CONSTRAINT "CategoryMallPricing_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES public."Zone"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Category Category_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ContractAmendment ContractAmendment_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractAmendment"
    ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ContractClause ContractClause_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractClause"
    ADD CONSTRAINT "ContractClause_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."ContractTemplate"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContractEvent ContractEvent_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractEvent"
    ADD CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContractEvent ContractEvent_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractEvent"
    ADD CONSTRAINT "ContractEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ContractFile ContractFile_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractFile"
    ADD CONSTRAINT "ContractFile_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ContractTermination ContractTermination_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ContractTermination"
    ADD CONSTRAINT "ContractTermination_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Contract Contract_managedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contract Contract_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contract Contract_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."ContractTemplate"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contract Contract_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Contract Contract_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerActivity CustomerActivity_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CustomerActivity"
    ADD CONSTRAINT "CustomerActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerActivity CustomerActivity_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."CustomerActivity"
    ADD CONSTRAINT "CustomerActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Customer Customer_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Customer Customer_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Customer Customer_preferredCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_preferredCategoryId_fkey" FOREIGN KEY ("preferredCategoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Customer Customer_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DepositAccount DepositAccount_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DepositAccount"
    ADD CONSTRAINT "DepositAccount_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DepositAccount DepositAccount_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DepositAccount"
    ADD CONSTRAINT "DepositAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DocumentDownloadLog DocumentDownloadLog_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DocumentDownloadLog"
    ADD CONSTRAINT "DocumentDownloadLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."UnifiedDocument"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DocumentDownloadLog DocumentDownloadLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."DocumentDownloadLog"
    ADD CONSTRAINT "DocumentDownloadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FitoutChecklist FitoutChecklist_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutChecklist"
    ADD CONSTRAINT "FitoutChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."FitoutProject"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FitoutContractor FitoutContractor_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutContractor"
    ADD CONSTRAINT "FitoutContractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."FitoutProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FitoutDocument FitoutDocument_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutDocument"
    ADD CONSTRAINT "FitoutDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."FitoutProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FitoutMilestone FitoutMilestone_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutMilestone"
    ADD CONSTRAINT "FitoutMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."FitoutProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FitoutProject FitoutProject_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutProject"
    ADD CONSTRAINT "FitoutProject_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FitoutProject FitoutProject_operationManagerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutProject"
    ADD CONSTRAINT "FitoutProject_operationManagerId_fkey" FOREIGN KEY ("operationManagerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FitoutProject FitoutProject_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutProject"
    ADD CONSTRAINT "FitoutProject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FitoutProject FitoutProject_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FitoutProject"
    ADD CONSTRAINT "FitoutProject_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FloorPlanAnalysis FloorPlanAnalysis_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."FloorPlanAnalysis"
    ADD CONSTRAINT "FloorPlanAnalysis_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Floor Floor_buildingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Floor"
    ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES public."Building"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Floor Floor_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Floor"
    ADD CONSTRAINT "Floor_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InvoiceLine InvoiceLine_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."InvoiceLine"
    ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invoice Invoice_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invoice Invoice_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadActivity LeadActivity_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadActivity"
    ADD CONSTRAINT "LeadActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadActivity LeadActivity_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadActivity"
    ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadContact LeadContact_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadContact"
    ADD CONSTRAINT "LeadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LeadFollowUp LeadFollowUp_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LeadFollowUp LeadFollowUp_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LeadFollowUp LeadFollowUp_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."LeadFollowUp"
    ADD CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Lead Lead_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MaintenanceSchedule MaintenanceSchedule_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MaintenanceSchedule MaintenanceSchedule_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MallAnnouncement MallAnnouncement_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MallAnnouncement"
    ADD CONSTRAINT "MallAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MallAnnouncement MallAnnouncement_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MallAnnouncement"
    ADD CONSTRAINT "MallAnnouncement_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MallPolicy MallPolicy_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."MallPolicy"
    ADD CONSTRAINT "MallPolicy_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OccupancySnapshot OccupancySnapshot_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."OccupancySnapshot"
    ADD CONSTRAINT "OccupancySnapshot_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PaymentReconciliation PaymentReconciliation_bankStatementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."PaymentReconciliation"
    ADD CONSTRAINT "PaymentReconciliation_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES public."BankStatement"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PaymentReconciliation PaymentReconciliation_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."PaymentReconciliation"
    ADD CONSTRAINT "PaymentReconciliation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."Payment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Payment Payment_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoice"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Payment Payment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProposalDealScore ProposalDealScore_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalDealScore"
    ADD CONSTRAINT "ProposalDealScore_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProposalNegotiationRound ProposalNegotiationRound_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalNegotiationRound"
    ADD CONSTRAINT "ProposalNegotiationRound_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProposalScenario ProposalScenario_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalScenario"
    ADD CONSTRAINT "ProposalScenario_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProposalVersion ProposalVersion_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."ProposalVersion"
    ADD CONSTRAINT "ProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposal"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Proposal Proposal_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Proposal"
    ADD CONSTRAINT "Proposal_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."UnitBooking"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Proposal Proposal_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Proposal"
    ADD CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Proposal Proposal_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Proposal"
    ADD CONSTRAINT "Proposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Proposal Proposal_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Proposal"
    ADD CONSTRAINT "Proposal_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RenewalRiskScore RenewalRiskScore_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."RenewalRiskScore"
    ADD CONSTRAINT "RenewalRiskScore_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesAuditTrail SalesAuditTrail_performedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesAuditTrail"
    ADD CONSTRAINT "SalesAuditTrail_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SalesAuditTrail SalesAuditTrail_salesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesAuditTrail"
    ADD CONSTRAINT "SalesAuditTrail_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES public."SalesTurnover"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesTurnover SalesTurnover_recordedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesTurnover"
    ADD CONSTRAINT "SalesTurnover_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesTurnover SalesTurnover_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesTurnover"
    ADD CONSTRAINT "SalesTurnover_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SalesTurnover SalesTurnover_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SalesTurnover"
    ADD CONSTRAINT "SalesTurnover_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SlotBooking SlotBooking_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotBooking"
    ADD CONSTRAINT "SlotBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SlotBooking SlotBooking_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotBooking"
    ADD CONSTRAINT "SlotBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SlotBooking SlotBooking_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotBooking"
    ADD CONSTRAINT "SlotBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SlotBooking SlotBooking_slotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotBooking"
    ADD CONSTRAINT "SlotBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES public."UnitSlot"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SlotPricingRule SlotPricingRule_slotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."SlotPricingRule"
    ADD CONSTRAINT "SlotPricingRule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES public."UnitSlot"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Tenant Tenant_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TicketComment TicketComment_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketComment"
    ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TicketEscalation TicketEscalation_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketEscalation"
    ADD CONSTRAINT "TicketEscalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TicketFile TicketFile_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketFile"
    ADD CONSTRAINT "TicketFile_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TicketRating TicketRating_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."TicketRating"
    ADD CONSTRAINT "TicketRating_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Ticket Ticket_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Ticket Ticket_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnifiedDocument UnifiedDocument_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnifiedDocument"
    ADD CONSTRAINT "UnifiedDocument_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnifiedDocument UnifiedDocument_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnifiedDocument"
    ADD CONSTRAINT "UnifiedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnitBooking UnitBooking_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnitBooking UnitBooking_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnitBooking UnitBooking_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnitBooking UnitBooking_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnitBooking UnitBooking_priceApprovedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_priceApprovedById_fkey" FOREIGN KEY ("priceApprovedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnitBooking UnitBooking_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitBooking"
    ADD CONSTRAINT "UnitBooking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnitHistory UnitHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitHistory"
    ADD CONSTRAINT "UnitHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnitHistory UnitHistory_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitHistory"
    ADD CONSTRAINT "UnitHistory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UnitMedia UnitMedia_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitMedia"
    ADD CONSTRAINT "UnitMedia_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UnitMedia UnitMedia_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitMedia"
    ADD CONSTRAINT "UnitMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnitSlot UnitSlot_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UnitSlot"
    ADD CONSTRAINT "UnitSlot_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."Unit"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Unit Unit_buildingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES public."Building"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Unit Unit_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Unit Unit_floorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES public."Floor"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Unit Unit_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Unit Unit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Unit Unit_zoneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Unit"
    ADD CONSTRAINT "Unit_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES public."Zone"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UserMallAccess UserMallAccess_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UserMallAccess"
    ADD CONSTRAINT "UserMallAccess_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserMallAccess UserMallAccess_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."UserMallAccess"
    ADD CONSTRAINT "UserMallAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkerAccessLog WorkerAccessLog_contractorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."WorkerAccessLog"
    ADD CONSTRAINT "WorkerAccessLog_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES public."FitoutContractor"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkerAccessLog WorkerAccessLog_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."WorkerAccessLog"
    ADD CONSTRAINT "WorkerAccessLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."FitoutProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Zone Zone_buildingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Zone"
    ADD CONSTRAINT "Zone_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES public."Building"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Zone Zone_floorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Zone"
    ADD CONSTRAINT "Zone_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES public."Floor"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Zone Zone_mallId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: leasing
--

ALTER TABLE ONLY public."Zone"
    ADD CONSTRAINT "Zone_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES public."Mall"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict RgrUuCsn6JtTxRvukVan2bmkzgJaFtPsfHu7iVzmZt1vMTW3zTpU7fkHcQuE6H0

--
-- Database "postgres" dump
--

--
-- PostgreSQL database dump
--

\restrict JkvYCynOViYCEvM1NMeT1wsDhJeTOWNN2eELlNsdtHA0BFH766mVoAJL2ma6HdI

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE postgres;
--
-- Name: postgres; Type: DATABASE; Schema: -; Owner: leasing
--

CREATE DATABASE postgres WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE postgres OWNER TO leasing;

\unrestrict JkvYCynOViYCEvM1NMeT1wsDhJeTOWNN2eELlNsdtHA0BFH766mVoAJL2ma6HdI
\connect postgres
\restrict JkvYCynOViYCEvM1NMeT1wsDhJeTOWNN2eELlNsdtHA0BFH766mVoAJL2ma6HdI

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE postgres; Type: COMMENT; Schema: -; Owner: leasing
--

COMMENT ON DATABASE postgres IS 'default administrative connection database';


--
-- PostgreSQL database dump complete
--

\unrestrict JkvYCynOViYCEvM1NMeT1wsDhJeTOWNN2eELlNsdtHA0BFH766mVoAJL2ma6HdI

--
-- PostgreSQL database cluster dump complete
--

