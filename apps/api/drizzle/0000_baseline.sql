-- BASELINE (squash of migrations 0000-0046). Full current schema: the RLS helper,
-- every table/index/FK/CHECK, row-level security, and the flagon_app grants. Sourced from
-- pg_dump of a fully-migrated database and validated by byte-diff. On a database that already
-- has this schema (production, post-0046) this migration is SKIPPED by the runner (journal
-- when=1); it only ever runs to build a FRESH database.

CREATE FUNCTION public.flagon_apply_tenant_rls(tbl regclass) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s '
    'USING (organization_id = NULLIF(current_setting(%L, true), %L)::uuid) '
    'WITH CHECK (organization_id = NULLIF(current_setting(%L, true), %L)::uuid)',
    tbl, 'app.current_org_id', '', 'app.current_org_id', ''
  );
END;
$$;



CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    bucket text NOT NULL,
    key text NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    purpose text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.assets FORCE ROW LEVEL SECURITY;

CREATE TABLE public.billing_credit_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    period_key text NOT NULL,
    stripe_grant_id text,
    amount_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.billing_credit_grants FORCE ROW LEVEL SECURITY;

CREATE TABLE public.client_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    prefix text NOT NULL,
    last_four text NOT NULL,
    created_by_user_id uuid,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token text,
    auto_expose boolean DEFAULT true NOT NULL
);

CREATE TABLE public.environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.environments FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiment_exposures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    experiment_id uuid NOT NULL,
    variant_key text NOT NULL,
    unit_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    day date NOT NULL
);

ALTER TABLE ONLY public.experiment_exposures FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiment_metric_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    unit_hash text NOT NULL,
    event_name text NOT NULL,
    value double precision DEFAULT 1 NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    day date NOT NULL,
    idempotency_key text,
    properties jsonb
);

ALTER TABLE ONLY public.experiment_metric_events FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiment_metric_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    experiment_id uuid NOT NULL,
    metric_id uuid NOT NULL,
    role text DEFAULT 'secondary'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metric_type text,
    event_name text,
    value_field text,
    direction text
);

ALTER TABLE ONLY public.experiment_metric_links FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiment_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    type text DEFAULT 'conversion'::text NOT NULL,
    event_name text NOT NULL,
    value_field text,
    direction text DEFAULT 'increase'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.experiment_metrics FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiment_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    experiment_id uuid NOT NULL,
    metric_id uuid NOT NULL,
    variant_key text NOT NULL,
    day date NOT NULL,
    units integer DEFAULT 0 NOT NULL,
    conversions integer DEFAULT 0 NOT NULL,
    metric_sum double precision DEFAULT 0 NOT NULL,
    metric_sum_sq double precision DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.experiment_results FORCE ROW LEVEL SECURITY;

CREATE TABLE public.experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    hypothesis text,
    flag_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    control_variant_key text,
    allocation integer DEFAULT 100 NOT NULL,
    bucket_by text,
    primary_metric_id uuid,
    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    decision text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confidence_level integer DEFAULT 95 NOT NULL,
    sequential boolean DEFAULT true NOT NULL,
    correction text DEFAULT 'none'::text NOT NULL,
    cuped boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.experiments FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    default_variant_id uuid,
    off_variant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_serve jsonb,
    reuse_source_environment_id uuid
);

ALTER TABLE ONLY public.flag_environments FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_eval_rollups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    day date NOT NULL,
    variant_key text DEFAULT ''::text NOT NULL,
    reason text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flag_eval_rollups FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_exposures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    variant_key text NOT NULL,
    unit_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    day date NOT NULL
);

ALTER TABLE ONLY public.flag_exposures FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_metric_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    metric_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flag_metric_links FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    summary text,
    diff jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb
);

ALTER TABLE ONLY public.flag_revisions FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_environment_id uuid NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    description text,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    serve jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flag_rules FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flag_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    flag_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    label text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flag_variants FORCE ROW LEVEL SECURITY;

CREATE TABLE public.flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    type text DEFAULT 'boolean'::text NOT NULL,
    permanent boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    maintainer_user_id uuid,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL
);

ALTER TABLE ONLY public.flags FORCE ROW LEVEL SECURITY;

CREATE TABLE public.holdouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    percentage integer DEFAULT 5 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.holdouts FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_action_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    assignee_user_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incident_action_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text])))
);

ALTER TABLE ONLY public.incident_action_items FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    runbook_id uuid,
    runbook_name text,
    "position" integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    body text,
    kind text DEFAULT 'task'::text NOT NULL,
    url text,
    done boolean DEFAULT false NOT NULL,
    done_by_user_id uuid,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.incident_checklist_items FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_rccas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    template jsonb
);

ALTER TABLE ONLY public.incident_rccas FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.incident_services FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_severity_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    rank integer NOT NULL,
    color text DEFAULT '#a1a1aa'::text NOT NULL,
    downtime_weight double precision DEFAULT 1 NOT NULL,
    platform_mode text DEFAULT 'proportional'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.incident_severity_levels FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    body text NOT NULL,
    status text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.incident_updates FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incident_webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    runbook_id uuid,
    runbook_name text,
    step_title text NOT NULL,
    url text NOT NULL,
    method text NOT NULL,
    ok boolean NOT NULL,
    status_code integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.incident_webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    number integer NOT NULL,
    title text NOT NULL,
    summary text,
    severity text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    owner_team_id uuid,
    escalation_policy_id uuid,
    declared_by_user_id uuid,
    acknowledged_at timestamp with time zone,
    acknowledged_by_user_id uuid,
    escalated_level integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text])))
);

ALTER TABLE ONLY public.incidents FORCE ROW LEVEL SECURITY;



CREATE TABLE public.notification_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    value text NOT NULL,
    label text,
    verified boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_channels_type_check CHECK ((type = ANY (ARRAY['email'::text, 'sms'::text, 'voice'::text, 'push'::text])))
);

CREATE TABLE public.oncall_escalation_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    delay_minutes integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oncall_escalation_levels_target_type_check CHECK ((target_type = ANY (ARRAY['schedule'::text, 'team'::text, 'user'::text])))
);

ALTER TABLE ONLY public.oncall_escalation_levels FORCE ROW LEVEL SECURITY;

CREATE TABLE public.oncall_escalation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    repeat_count integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.oncall_escalation_policies FORCE ROW LEVEL SECURITY;

CREATE TABLE public.oncall_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    user_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.oncall_overrides FORCE ROW LEVEL SECURITY;

CREATE TABLE public.oncall_schedule_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    user_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.oncall_schedule_members FORCE ROW LEVEL SECURITY;

CREATE TABLE public.oncall_schedule_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    team_id uuid NOT NULL
);

ALTER TABLE ONLY public.oncall_schedule_teams FORCE ROW LEVEL SECURITY;

CREATE TABLE public.oncall_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    rotation_interval_hours integer DEFAULT 168 NOT NULL,
    anchor_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.oncall_schedules FORCE ROW LEVEL SECURITY;


CREATE TABLE public.org_usage_counters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    period text NOT NULL,
    count bigint DEFAULT 0 NOT NULL,
    notified_80_at timestamp with time zone,
    notified_100_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.org_usage_counters FORCE ROW LEVEL SECURITY;


CREATE TABLE public.project_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    team_id uuid NOT NULL,
    role text DEFAULT 'read'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.project_access FORCE ROW LEVEL SECURITY;

CREATE TABLE public.project_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source_project_id uuid NOT NULL,
    type text NOT NULL,
    target_kind text DEFAULT 'project'::text NOT NULL,
    target_project_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_relations_no_self CHECK ((source_project_id <> target_project_id))
);

ALTER TABLE ONLY public.project_relations FORCE ROW LEVEL SECURITY;

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    owner_team_id uuid,
    lifecycle text,
    tier text,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    readme text,
    framework text,
    image text,
    kind text,
    domains text[] DEFAULT ARRAY[]::text[] NOT NULL,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    repo_url text,
    repo_provider text,
    repo_name text,
    repo_default_branch text,
    repo_visibility text
);

ALTER TABLE ONLY public.projects FORCE ROW LEVEL SECURITY;

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rcca_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    required_severities text[] DEFAULT ARRAY[]::text[] NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.rcca_templates FORCE ROW LEVEL SECURITY;

CREATE TABLE public.reliability_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    label text DEFAULT 'SLO'::text NOT NULL,
    scope_type text DEFAULT 'org'::text NOT NULL,
    scope_project_id uuid,
    target_pct double precision NOT NULL,
    window_days integer DEFAULT 30 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reliability_objectives FORCE ROW LEVEL SECURITY;

CREATE TABLE public.runbook_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    runbook_id uuid NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.runbook_services FORCE ROW LEVEL SECURITY;

CREATE TABLE public.runbook_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    runbook_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    body text,
    kind text DEFAULT 'task'::text NOT NULL,
    url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    config jsonb
);

ALTER TABLE ONLY public.runbook_steps FORCE ROW LEVEL SECURITY;

CREATE TABLE public.runbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    trigger_severity text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.runbooks FORCE ROW LEVEL SECURITY;




CREATE TABLE public.segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.segments FORCE ROW LEVEL SECURITY;



CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.team_members FORCE ROW LEVEL SECURITY;

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.teams FORCE ROW LEVEL SECURITY;


CREATE TABLE public.usage_event_rollups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    day date NOT NULL,
    source text DEFAULT 'flags.exposure'::text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.usage_event_rollups FORCE ROW LEVEL SECURITY;

CREATE TABLE public.usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source text DEFAULT 'flags.exposure'::text NOT NULL,
    idempotency_key text NOT NULL,
    quantity integer NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    day date NOT NULL,
    compacted_at timestamp with time zone,
    reported_at timestamp with time zone,
    report_id uuid
);

ALTER TABLE ONLY public.usage_events FORCE ROW LEVEL SECURITY;

CREATE TABLE public.usage_meter_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source text NOT NULL,
    event_name text NOT NULL,
    stripe_customer_id text NOT NULL,
    quantity bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    period_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    stripe_summary_verified_at timestamp with time zone
);

ALTER TABLE ONLY public.usage_meter_reports FORCE ROW LEVEL SECURITY;







ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_credit_grants
    ADD CONSTRAINT billing_credit_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_keys
    ADD CONSTRAINT client_keys_key_hash_unique UNIQUE (key_hash);

ALTER TABLE ONLY public.client_keys
    ADD CONSTRAINT client_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_exposures
    ADD CONSTRAINT experiment_exposures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_metric_events
    ADD CONSTRAINT experiment_metric_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_metric_links
    ADD CONSTRAINT experiment_metric_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_metrics
    ADD CONSTRAINT experiment_metrics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_results
    ADD CONSTRAINT experiment_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_eval_rollups
    ADD CONSTRAINT flag_eval_rollups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_exposures
    ADD CONSTRAINT flag_exposures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_metric_links
    ADD CONSTRAINT flag_metric_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_revisions
    ADD CONSTRAINT flag_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_rules
    ADD CONSTRAINT flag_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flag_variants
    ADD CONSTRAINT flag_variants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flags
    ADD CONSTRAINT flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.holdouts
    ADD CONSTRAINT holdouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_action_items
    ADD CONSTRAINT incident_action_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_checklist_items
    ADD CONSTRAINT incident_checklist_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_rccas
    ADD CONSTRAINT incident_rccas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_services
    ADD CONSTRAINT incident_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_severity_levels
    ADD CONSTRAINT incident_severity_levels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_updates
    ADD CONSTRAINT incident_updates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incident_webhook_deliveries
    ADD CONSTRAINT incident_webhook_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.notification_channels
    ADD CONSTRAINT notification_channels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_escalation_levels
    ADD CONSTRAINT oncall_escalation_levels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_escalation_policies
    ADD CONSTRAINT oncall_escalation_policies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_overrides
    ADD CONSTRAINT oncall_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_schedule_members
    ADD CONSTRAINT oncall_schedule_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_schedule_teams
    ADD CONSTRAINT oncall_schedule_teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oncall_schedules
    ADD CONSTRAINT oncall_schedules_pkey PRIMARY KEY (id);


ALTER TABLE ONLY public.org_usage_counters
    ADD CONSTRAINT org_usage_counters_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.project_access
    ADD CONSTRAINT project_access_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.project_relations
    ADD CONSTRAINT project_relations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.rcca_templates
    ADD CONSTRAINT rcca_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reliability_objectives
    ADD CONSTRAINT reliability_objectives_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runbook_services
    ADD CONSTRAINT runbook_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runbook_steps
    ADD CONSTRAINT runbook_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.runbooks
    ADD CONSTRAINT runbooks_pkey PRIMARY KEY (id);





ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_pkey PRIMARY KEY (id);





ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


ALTER TABLE ONLY public.usage_event_rollups
    ADD CONSTRAINT usage_event_rollups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usage_meter_reports
    ADD CONSTRAINT usage_meter_reports_pkey PRIMARY KEY (id);









CREATE UNIQUE INDEX assets_bucket_key_key ON public.assets USING btree (bucket, key);

CREATE INDEX assets_org_idx ON public.assets USING btree (organization_id);

CREATE UNIQUE INDEX billing_credit_grants_org_period_key ON public.billing_credit_grants USING btree (organization_id, period_key);

CREATE INDEX client_keys_env_idx ON public.client_keys USING btree (environment_id);

CREATE INDEX client_keys_org_idx ON public.client_keys USING btree (organization_id);

CREATE INDEX environments_org_idx ON public.environments USING btree (organization_id);

CREATE UNIQUE INDEX environments_org_key_key ON public.environments USING btree (organization_id, key);

CREATE UNIQUE INDEX experiment_exposures_exp_unit_key ON public.experiment_exposures USING btree (experiment_id, unit_hash);

CREATE INDEX experiment_exposures_exp_variant_idx ON public.experiment_exposures USING btree (experiment_id, variant_key);

CREATE INDEX experiment_exposures_org_idx ON public.experiment_exposures USING btree (organization_id);

CREATE UNIQUE INDEX experiment_metric_events_idem_key ON public.experiment_metric_events USING btree (organization_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX experiment_metric_events_org_day_idx ON public.experiment_metric_events USING btree (organization_id, day);

CREATE INDEX experiment_metric_events_org_event_idx ON public.experiment_metric_events USING btree (organization_id, event_name);

CREATE INDEX experiment_metric_events_org_unit_idx ON public.experiment_metric_events USING btree (organization_id, unit_hash);

CREATE INDEX experiment_metric_links_exp_idx ON public.experiment_metric_links USING btree (experiment_id);

CREATE UNIQUE INDEX experiment_metric_links_exp_metric_key ON public.experiment_metric_links USING btree (experiment_id, metric_id);

CREATE INDEX experiment_metric_links_org_idx ON public.experiment_metric_links USING btree (organization_id);

CREATE INDEX experiment_metrics_org_event_idx ON public.experiment_metrics USING btree (organization_id, event_name);

CREATE INDEX experiment_metrics_org_idx ON public.experiment_metrics USING btree (organization_id);

CREATE UNIQUE INDEX experiment_metrics_org_key_key ON public.experiment_metrics USING btree (organization_id, key);

CREATE UNIQUE INDEX experiment_results_bucket_key ON public.experiment_results USING btree (experiment_id, metric_id, variant_key, day);

CREATE INDEX experiment_results_exp_idx ON public.experiment_results USING btree (experiment_id);

CREATE INDEX experiment_results_org_idx ON public.experiment_results USING btree (organization_id);

CREATE INDEX experiments_flag_idx ON public.experiments USING btree (flag_id);

CREATE INDEX experiments_org_idx ON public.experiments USING btree (organization_id);

CREATE UNIQUE INDEX experiments_org_key_key ON public.experiments USING btree (organization_id, key);

CREATE INDEX flag_environments_env_idx ON public.flag_environments USING btree (environment_id);

CREATE UNIQUE INDEX flag_environments_flag_env_key ON public.flag_environments USING btree (flag_id, environment_id);

CREATE INDEX flag_environments_org_idx ON public.flag_environments USING btree (organization_id);

CREATE UNIQUE INDEX flag_eval_rollups_bucket_key ON public.flag_eval_rollups USING btree (flag_id, environment_id, day, variant_key, reason);

CREATE INDEX flag_eval_rollups_flag_idx ON public.flag_eval_rollups USING btree (flag_id, environment_id);

CREATE INDEX flag_eval_rollups_org_idx ON public.flag_eval_rollups USING btree (organization_id);

CREATE UNIQUE INDEX flag_exposures_flag_env_unit_key ON public.flag_exposures USING btree (flag_id, environment_id, unit_hash);

CREATE INDEX flag_exposures_flag_env_variant_idx ON public.flag_exposures USING btree (flag_id, environment_id, variant_key);

CREATE INDEX flag_exposures_org_idx ON public.flag_exposures USING btree (organization_id);

CREATE INDEX flag_metric_links_flag_idx ON public.flag_metric_links USING btree (flag_id);

CREATE UNIQUE INDEX flag_metric_links_flag_metric_key ON public.flag_metric_links USING btree (flag_id, metric_id);

CREATE INDEX flag_metric_links_org_idx ON public.flag_metric_links USING btree (organization_id);

CREATE INDEX flag_revisions_flag_idx ON public.flag_revisions USING btree (flag_id, created_at);

CREATE INDEX flag_revisions_org_idx ON public.flag_revisions USING btree (organization_id);

CREATE INDEX flag_rules_env_priority_idx ON public.flag_rules USING btree (flag_environment_id, priority);

CREATE INDEX flag_rules_org_idx ON public.flag_rules USING btree (organization_id);

CREATE INDEX flag_variants_flag_idx ON public.flag_variants USING btree (flag_id);

CREATE UNIQUE INDEX flag_variants_flag_key_key ON public.flag_variants USING btree (flag_id, key);

CREATE INDEX flag_variants_org_idx ON public.flag_variants USING btree (organization_id);

CREATE INDEX flags_org_archived_idx ON public.flags USING btree (organization_id, archived_at);

CREATE INDEX flags_org_idx ON public.flags USING btree (organization_id);

CREATE UNIQUE INDEX flags_org_key_key ON public.flags USING btree (organization_id, key);

CREATE INDEX holdouts_env_status_idx ON public.holdouts USING btree (environment_id, status);

CREATE INDEX holdouts_org_idx ON public.holdouts USING btree (organization_id);

CREATE UNIQUE INDEX holdouts_org_key_key ON public.holdouts USING btree (organization_id, key);

CREATE INDEX incident_action_items_incident_idx ON public.incident_action_items USING btree (incident_id, created_at);

CREATE INDEX incident_action_items_org_idx ON public.incident_action_items USING btree (organization_id);

CREATE INDEX incident_checklist_incident_idx ON public.incident_checklist_items USING btree (incident_id, "position");

CREATE INDEX incident_checklist_org_idx ON public.incident_checklist_items USING btree (organization_id);

CREATE UNIQUE INDEX incident_rccas_incident_key ON public.incident_rccas USING btree (incident_id);

CREATE INDEX incident_rccas_org_idx ON public.incident_rccas USING btree (organization_id);

CREATE INDEX incident_services_incident_idx ON public.incident_services USING btree (incident_id);

CREATE UNIQUE INDEX incident_services_incident_project_key ON public.incident_services USING btree (incident_id, project_id);

CREATE INDEX incident_services_org_idx ON public.incident_services USING btree (organization_id);

CREATE INDEX incident_services_project_idx ON public.incident_services USING btree (project_id);

CREATE INDEX incident_severity_levels_org_idx ON public.incident_severity_levels USING btree (organization_id);

CREATE UNIQUE INDEX incident_severity_levels_org_key ON public.incident_severity_levels USING btree (organization_id, key);

CREATE INDEX incident_updates_incident_idx ON public.incident_updates USING btree (incident_id, created_at);

CREATE INDEX incident_updates_org_idx ON public.incident_updates USING btree (organization_id);

CREATE INDEX incident_webhook_deliveries_incident_idx ON public.incident_webhook_deliveries USING btree (incident_id, created_at);

CREATE INDEX incident_webhook_deliveries_org_idx ON public.incident_webhook_deliveries USING btree (organization_id);

CREATE INDEX incidents_org_idx ON public.incidents USING btree (organization_id);

CREATE UNIQUE INDEX incidents_org_number_key ON public.incidents USING btree (organization_id, number);

CREATE INDEX incidents_org_status_idx ON public.incidents USING btree (organization_id, status);

CREATE INDEX incidents_owner_team_idx ON public.incidents USING btree (owner_team_id);





CREATE INDEX notification_channels_user_idx ON public.notification_channels USING btree (user_id);

CREATE INDEX oncall_escalation_levels_org_idx ON public.oncall_escalation_levels USING btree (organization_id);

CREATE INDEX oncall_escalation_levels_policy_idx ON public.oncall_escalation_levels USING btree (policy_id, "position");

CREATE INDEX oncall_escalation_policies_org_idx ON public.oncall_escalation_policies USING btree (organization_id);

CREATE UNIQUE INDEX oncall_escalation_policies_org_key_key ON public.oncall_escalation_policies USING btree (organization_id, key);

CREATE INDEX oncall_overrides_org_idx ON public.oncall_overrides USING btree (organization_id);

CREATE INDEX oncall_overrides_schedule_idx ON public.oncall_overrides USING btree (schedule_id);

CREATE INDEX oncall_schedule_members_org_idx ON public.oncall_schedule_members USING btree (organization_id);

CREATE INDEX oncall_schedule_members_schedule_idx ON public.oncall_schedule_members USING btree (schedule_id);

CREATE UNIQUE INDEX oncall_schedule_members_schedule_user_key ON public.oncall_schedule_members USING btree (schedule_id, user_id);

CREATE INDEX oncall_schedule_teams_org_idx ON public.oncall_schedule_teams USING btree (organization_id);

CREATE UNIQUE INDEX oncall_schedule_teams_sched_team_key ON public.oncall_schedule_teams USING btree (schedule_id, team_id);

CREATE INDEX oncall_schedule_teams_team_idx ON public.oncall_schedule_teams USING btree (team_id);

CREATE INDEX oncall_schedules_org_idx ON public.oncall_schedules USING btree (organization_id);

CREATE UNIQUE INDEX oncall_schedules_org_key_key ON public.oncall_schedules USING btree (organization_id, key);

CREATE INDEX oncall_schedules_team_idx ON public.oncall_schedules USING btree (team_id);


CREATE UNIQUE INDEX org_usage_counters_bucket_key ON public.org_usage_counters USING btree (organization_id, period);


CREATE INDEX project_access_org_idx ON public.project_access USING btree (organization_id);

CREATE INDEX project_access_project_idx ON public.project_access USING btree (project_id);

CREATE UNIQUE INDEX project_access_project_team_key ON public.project_access USING btree (project_id, team_id);

CREATE UNIQUE INDEX project_relations_edge_key ON public.project_relations USING btree (source_project_id, type, target_project_id);

CREATE INDEX project_relations_org_idx ON public.project_relations USING btree (organization_id);

CREATE INDEX project_relations_source_idx ON public.project_relations USING btree (source_project_id);

CREATE INDEX project_relations_target_idx ON public.project_relations USING btree (target_project_id);

CREATE INDEX projects_org_idx ON public.projects USING btree (organization_id);

CREATE UNIQUE INDEX projects_org_key_key ON public.projects USING btree (organization_id, key);

CREATE INDEX projects_owner_team_idx ON public.projects USING btree (owner_team_id);

CREATE UNIQUE INDEX rcca_templates_org_key ON public.rcca_templates USING btree (organization_id);

CREATE INDEX reliability_objectives_org_idx ON public.reliability_objectives USING btree (organization_id);

CREATE UNIQUE INDEX reliability_objectives_org_key ON public.reliability_objectives USING btree (organization_id, key);

CREATE INDEX runbook_services_org_idx ON public.runbook_services USING btree (organization_id);

CREATE INDEX runbook_services_project_idx ON public.runbook_services USING btree (project_id);

CREATE UNIQUE INDEX runbook_services_runbook_project_key ON public.runbook_services USING btree (runbook_id, project_id);

CREATE INDEX runbook_steps_org_idx ON public.runbook_steps USING btree (organization_id);

CREATE INDEX runbook_steps_runbook_idx ON public.runbook_steps USING btree (runbook_id, "position");

CREATE INDEX runbooks_org_idx ON public.runbooks USING btree (organization_id);

CREATE UNIQUE INDEX runbooks_org_key_key ON public.runbooks USING btree (organization_id, key);





CREATE INDEX segments_org_idx ON public.segments USING btree (organization_id);

CREATE UNIQUE INDEX segments_org_key_key ON public.segments USING btree (organization_id, key);



CREATE INDEX team_members_org_idx ON public.team_members USING btree (organization_id);

CREATE INDEX team_members_team_idx ON public.team_members USING btree (team_id);

CREATE UNIQUE INDEX team_members_team_user_key ON public.team_members USING btree (team_id, user_id);

CREATE INDEX teams_org_idx ON public.teams USING btree (organization_id);

CREATE UNIQUE INDEX teams_org_key_key ON public.teams USING btree (organization_id, key);


CREATE UNIQUE INDEX usage_event_rollups_bucket_key ON public.usage_event_rollups USING btree (organization_id, day, source);

CREATE INDEX usage_event_rollups_org_idx ON public.usage_event_rollups USING btree (organization_id);

CREATE UNIQUE INDEX usage_events_idempotency_key ON public.usage_events USING btree (organization_id, source, idempotency_key);

CREATE INDEX usage_events_uncompacted_idx ON public.usage_events USING btree (organization_id) WHERE (compacted_at IS NULL);

CREATE INDEX usage_events_unreported_idx ON public.usage_events USING btree (organization_id) WHERE (reported_at IS NULL);

CREATE INDEX usage_meter_reports_pending_idx ON public.usage_meter_reports USING btree (organization_id) WHERE (status = 'pending'::text);









ALTER TABLE ONLY public.client_keys
    ADD CONSTRAINT client_keys_environment_id_environments_id_fk FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_exposures
    ADD CONSTRAINT experiment_exposures_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_metric_links
    ADD CONSTRAINT experiment_metric_links_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_metric_links
    ADD CONSTRAINT experiment_metric_links_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.experiment_metrics(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_results
    ADD CONSTRAINT experiment_results_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_results
    ADD CONSTRAINT experiment_results_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.experiment_metrics(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_primary_metric_id_fkey FOREIGN KEY (primary_metric_id) REFERENCES public.experiment_metrics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_default_variant_id_flag_variants_id_fk FOREIGN KEY (default_variant_id) REFERENCES public.flag_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_environment_id_environments_id_fk FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_flag_id_flags_id_fk FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_off_variant_id_flag_variants_id_fk FOREIGN KEY (off_variant_id) REFERENCES public.flag_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flag_environments
    ADD CONSTRAINT flag_environments_reuse_source_environment_id_fkey FOREIGN KEY (reuse_source_environment_id) REFERENCES public.environments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flag_eval_rollups
    ADD CONSTRAINT flag_eval_rollups_environment_id_environments_id_fk FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_eval_rollups
    ADD CONSTRAINT flag_eval_rollups_flag_id_flags_id_fk FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_exposures
    ADD CONSTRAINT flag_exposures_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_exposures
    ADD CONSTRAINT flag_exposures_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_metric_links
    ADD CONSTRAINT flag_metric_links_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_metric_links
    ADD CONSTRAINT flag_metric_links_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.experiment_metrics(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_revisions
    ADD CONSTRAINT flag_revisions_flag_id_flags_id_fk FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_rules
    ADD CONSTRAINT flag_rules_flag_environment_id_flag_environments_id_fk FOREIGN KEY (flag_environment_id) REFERENCES public.flag_environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flag_variants
    ADD CONSTRAINT flag_variants_flag_id_flags_id_fk FOREIGN KEY (flag_id) REFERENCES public.flags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.holdouts
    ADD CONSTRAINT holdouts_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_action_items
    ADD CONSTRAINT incident_action_items_incident_id_incidents_id_fk FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_checklist_items
    ADD CONSTRAINT incident_checklist_items_incident_id_incidents_id_fk FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_checklist_items
    ADD CONSTRAINT incident_checklist_items_runbook_id_runbooks_id_fk FOREIGN KEY (runbook_id) REFERENCES public.runbooks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.incident_rccas
    ADD CONSTRAINT incident_rccas_incident_id_incidents_id_fk FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_services
    ADD CONSTRAINT incident_services_incident_id_incidents_id_fk FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_services
    ADD CONSTRAINT incident_services_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_updates
    ADD CONSTRAINT incident_updates_incident_id_incidents_id_fk FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incident_webhook_deliveries
    ADD CONSTRAINT incident_webhook_deliveries_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_escalation_policy_id_oncall_escalation_policies_id_fk FOREIGN KEY (escalation_policy_id) REFERENCES public.oncall_escalation_policies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_owner_team_id_teams_id_fk FOREIGN KEY (owner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;





ALTER TABLE ONLY public.oncall_escalation_levels
    ADD CONSTRAINT oncall_escalation_levels_policy_id_oncall_escalation_policies_i FOREIGN KEY (policy_id) REFERENCES public.oncall_escalation_policies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oncall_overrides
    ADD CONSTRAINT oncall_overrides_schedule_id_oncall_schedules_id_fk FOREIGN KEY (schedule_id) REFERENCES public.oncall_schedules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oncall_schedule_members
    ADD CONSTRAINT oncall_schedule_members_schedule_id_oncall_schedules_id_fk FOREIGN KEY (schedule_id) REFERENCES public.oncall_schedules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oncall_schedule_teams
    ADD CONSTRAINT oncall_schedule_teams_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.oncall_schedules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oncall_schedule_teams
    ADD CONSTRAINT oncall_schedule_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oncall_schedules
    ADD CONSTRAINT oncall_schedules_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.project_access
    ADD CONSTRAINT project_access_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_access
    ADD CONSTRAINT project_access_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_relations
    ADD CONSTRAINT project_relations_source_project_id_projects_id_fk FOREIGN KEY (source_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_relations
    ADD CONSTRAINT project_relations_target_project_id_projects_id_fk FOREIGN KEY (target_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_team_id_teams_id_fk FOREIGN KEY (owner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reliability_objectives
    ADD CONSTRAINT reliability_objectives_scope_project_id_projects_id_fk FOREIGN KEY (scope_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.runbook_services
    ADD CONSTRAINT runbook_services_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.runbook_services
    ADD CONSTRAINT runbook_services_runbook_id_runbooks_id_fk FOREIGN KEY (runbook_id) REFERENCES public.runbooks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.runbook_steps
    ADD CONSTRAINT runbook_steps_runbook_id_runbooks_id_fk FOREIGN KEY (runbook_id) REFERENCES public.runbooks(id) ON DELETE CASCADE;









ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;



ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_credit_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_exposures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_metric_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_metric_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_environments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_eval_rollups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_exposures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_metric_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_revisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flag_variants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holdouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_action_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_checklist_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_rccas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_severity_levels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_updates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incident_webhook_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_escalation_levels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_escalation_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_schedule_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_schedule_teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oncall_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_usage_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_relations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rcca_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reliability_objectives ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.runbook_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.runbook_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.runbooks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.assets USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.billing_credit_grants USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.environments USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiment_exposures USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiment_metric_events USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiment_metric_links USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiment_metrics USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiment_results USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.experiments USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_environments USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_eval_rollups USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_exposures USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_metric_links USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_revisions USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_rules USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flag_variants USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.flags USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.holdouts USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_action_items USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_checklist_items USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_rccas USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_services USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_severity_levels USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_updates USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incident_webhook_deliveries USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.incidents USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_escalation_levels USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_escalation_policies USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_overrides USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_schedule_members USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_schedule_teams USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.oncall_schedules USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.org_usage_counters USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.project_access USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.project_relations USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.projects USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.rcca_templates USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.reliability_objectives USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.runbook_services USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.runbook_steps USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.runbooks USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.segments USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.team_members USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.teams USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.usage_event_rollups USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.usage_events USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

CREATE POLICY tenant_isolation ON public.usage_meter_reports USING ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::uuid));

ALTER TABLE public.usage_event_rollups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_meter_reports ENABLE ROW LEVEL SECURITY;


-- App-role grants, guarded so a database without the restricted flagon_app role still applies
-- (matches the IF EXISTS pattern used across 0002/0041/0045).
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT USAGE ON SCHEMA public TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assets TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.billing_credit_grants TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.client_keys TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.environments TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiment_exposures TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiment_metric_events TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiment_metric_links TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiment_metrics TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiment_results TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiments TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_environments TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_eval_rollups TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_exposures TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_metric_links TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_revisions TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_rules TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flag_variants TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.flags TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holdouts TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_action_items TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_checklist_items TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_rccas TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_services TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_severity_levels TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_updates TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incident_webhook_deliveries TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.incidents TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notification_channels TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_escalation_levels TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_escalation_policies TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_overrides TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_schedule_members TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_schedule_teams TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oncall_schedules TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_usage_counters TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_access TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_relations TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.projects TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rate_limits TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rcca_templates TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reliability_objectives TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.runbook_services TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.runbook_steps TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.runbooks TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.segments TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.team_members TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.teams TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.usage_event_rollups TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.usage_events TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.usage_meter_reports TO flagon_app$g$;
  END IF;
END $rls$;
