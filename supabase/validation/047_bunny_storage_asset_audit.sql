-- Bunny CDN migration audit
-- Goal: identify all live DB references and legacy bucket objects that would break
-- if Supabase Storage buckets were removed today.

-- -----------------------------------------------------------------------------
-- 1. Summary: DB fields still pointing at Supabase Storage URLs
-- -----------------------------------------------------------------------------
with asset_ref_counts as (
  select 'organizations.imageURL' as source, count(*)::bigint as refs
  from public.organizations
  where coalesce("imageURL", '') ilike '%supabase.co/storage/%'
     or coalesce("imageURL", '') ilike '%/storage/v1/object/%'

  union all

  select 'organizations.public_metadata.imageURL', count(*)::bigint
  from public.organizations
  where coalesce(public_metadata->>'imageURL', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'imageURL', '') ilike '%/storage/v1/object/%'

  union all

  select 'organizations.public_metadata.online_store_w9_form_url', count(*)::bigint
  from public.organizations
  where coalesce(public_metadata->>'online_store_w9_form_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'online_store_w9_form_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'organizations.public_metadata.w9_form_url', count(*)::bigint
  from public.organizations
  where coalesce(public_metadata->>'w9_form_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'w9_form_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'organizations.public_metadata.online_store_owner_government_id_url', count(*)::bigint
  from public.organizations
  where coalesce(public_metadata->>'online_store_owner_government_id_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'online_store_owner_government_id_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'organizations.public_metadata.owner_government_id_url', count(*)::bigint
  from public.organizations
  where coalesce(public_metadata->>'owner_government_id_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'owner_government_id_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'locations.public_metadata.online_store_bank_support_document_url', count(*)::bigint
  from public.locations
  where coalesce(public_metadata->>'online_store_bank_support_document_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'online_store_bank_support_document_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'locations.public_metadata.bank_support_document_url', count(*)::bigint
  from public.locations
  where coalesce(public_metadata->>'bank_support_document_url', '') ilike '%supabase.co/storage/%'
     or coalesce(public_metadata->>'bank_support_document_url', '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_config.logo_url', count(*)::bigint
  from public.online_store_config
  where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
     or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_config.hero_image_url', count(*)::bigint
  from public.online_store_config
  where coalesce(hero_image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(hero_image_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_config.favicon_url', count(*)::bigint
  from public.online_store_config
  where coalesce(favicon_url, '') ilike '%supabase.co/storage/%'
     or coalesce(favicon_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_config.og_image_url', count(*)::bigint
  from public.online_store_config
  where coalesce(og_image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(og_image_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'sites.logo_url', count(*)::bigint
  from public.sites
  where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
     or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'receipt_templates.logo_url', count(*)::bigint
  from public.receipt_templates
  where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
     or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'cfd_carousel_images.image_url', count(*)::bigint
  from public.cfd_carousel_images
  where coalesce(image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(image_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'cfd_ordering_panel_images.image_url', count(*)::bigint
  from public.cfd_ordering_panel_images
  where coalesce(image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(image_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_pages.image_url', count(*)::bigint
  from public.online_store_pages
  where coalesce(image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(image_url, '') ilike '%/storage/v1/object/%'

  union all

  select 'online_store_pages.images', count(*)::bigint
  from public.online_store_pages
  where coalesce(images::text, '') ilike '%supabase.co/storage/%'
     or coalesce(images::text, '') ilike '%/storage/v1/object/%'

  union all

  select 'device_catalog.image_url', count(*)::bigint
  from public.device_catalog
  where coalesce(image_url, '') ilike '%supabase.co/storage/%'
     or coalesce(image_url, '') ilike '%/storage/v1/object/%'
)
select *
from asset_ref_counts
where refs > 0
order by refs desc, source;

-- -----------------------------------------------------------------------------
-- 2. Summary: rows that still depend on Supabase buckets without storing a URL
-- -----------------------------------------------------------------------------
select
  'support_ticket_attachments.file_path' as source,
  count(*)::bigint as refs
from public.support_ticket_attachments
where coalesce(file_path, '') <> '';

-- -----------------------------------------------------------------------------
-- 3. Summary: legacy bucket object inventory still present in Supabase Storage
-- -----------------------------------------------------------------------------
select
  bucket_id,
  count(*)::bigint as object_count
from storage.objects
where bucket_id in (
  'Organizations-Logos',
  'store-assets',
  'support-attachments',
  'cfd-images',
  'merchant-logos'
)
group by bucket_id
order by object_count desc, bucket_id;

-- -----------------------------------------------------------------------------
-- 4. Detail rows: top-level asset URL fields still pointing to Supabase
-- -----------------------------------------------------------------------------
select
  'organizations' as table_name,
  id::text as record_id,
  'imageURL' as field_name,
  "imageURL" as asset_ref
from public.organizations
where coalesce("imageURL", '') ilike '%supabase.co/storage/%'
   or coalesce("imageURL", '') ilike '%/storage/v1/object/%'

union all

select
  'online_store_config',
  id::text,
  'logo_url',
  logo_url
from public.online_store_config
where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
   or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

union all

select
  'online_store_config',
  id::text,
  'hero_image_url',
  hero_image_url
from public.online_store_config
where coalesce(hero_image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(hero_image_url, '') ilike '%/storage/v1/object/%'

union all

select
  'online_store_config',
  id::text,
  'favicon_url',
  favicon_url
from public.online_store_config
where coalesce(favicon_url, '') ilike '%supabase.co/storage/%'
   or coalesce(favicon_url, '') ilike '%/storage/v1/object/%'

union all

select
  'online_store_config',
  id::text,
  'og_image_url',
  og_image_url
from public.online_store_config
where coalesce(og_image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(og_image_url, '') ilike '%/storage/v1/object/%'

union all

select
  'sites',
  id::text,
  'logo_url',
  logo_url
from public.sites
where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
   or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

union all

select
  'receipt_templates',
  id::text,
  'logo_url',
  logo_url
from public.receipt_templates
where coalesce(logo_url, '') ilike '%supabase.co/storage/%'
   or coalesce(logo_url, '') ilike '%/storage/v1/object/%'

union all

select
  'cfd_carousel_images',
  id::text,
  'image_url',
  image_url
from public.cfd_carousel_images
where coalesce(image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(image_url, '') ilike '%/storage/v1/object/%'

union all

select
  'cfd_ordering_panel_images',
  id::text,
  'image_url',
  image_url
from public.cfd_ordering_panel_images
where coalesce(image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(image_url, '') ilike '%/storage/v1/object/%'

union all

select
  'online_store_pages',
  id::text,
  'image_url',
  image_url
from public.online_store_pages
where coalesce(image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(image_url, '') ilike '%/storage/v1/object/%'

union all

select
  'device_catalog',
  id::text,
  'image_url',
  image_url
from public.device_catalog
where coalesce(image_url, '') ilike '%supabase.co/storage/%'
   or coalesce(image_url, '') ilike '%/storage/v1/object/%'

order by table_name, field_name, record_id;

-- -----------------------------------------------------------------------------
-- 5. Detail rows: metadata-backed onboarding documents still on Supabase
-- -----------------------------------------------------------------------------
select
  'organizations' as table_name,
  id::text as record_id,
  'public_metadata.imageURL' as field_name,
  public_metadata->>'imageURL' as asset_ref
from public.organizations
where coalesce(public_metadata->>'imageURL', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'imageURL', '') ilike '%/storage/v1/object/%'

union all

select
  'organizations',
  id::text,
  'public_metadata.online_store_w9_form_url',
  public_metadata->>'online_store_w9_form_url'
from public.organizations
where coalesce(public_metadata->>'online_store_w9_form_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'online_store_w9_form_url', '') ilike '%/storage/v1/object/%'

union all

select
  'organizations',
  id::text,
  'public_metadata.w9_form_url',
  public_metadata->>'w9_form_url'
from public.organizations
where coalesce(public_metadata->>'w9_form_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'w9_form_url', '') ilike '%/storage/v1/object/%'

union all

select
  'organizations',
  id::text,
  'public_metadata.online_store_owner_government_id_url',
  public_metadata->>'online_store_owner_government_id_url'
from public.organizations
where coalesce(public_metadata->>'online_store_owner_government_id_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'online_store_owner_government_id_url', '') ilike '%/storage/v1/object/%'

union all

select
  'organizations',
  id::text,
  'public_metadata.owner_government_id_url',
  public_metadata->>'owner_government_id_url'
from public.organizations
where coalesce(public_metadata->>'owner_government_id_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'owner_government_id_url', '') ilike '%/storage/v1/object/%'

union all

select
  'locations',
  id::text,
  'public_metadata.online_store_bank_support_document_url',
  public_metadata->>'online_store_bank_support_document_url'
from public.locations
where coalesce(public_metadata->>'online_store_bank_support_document_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'online_store_bank_support_document_url', '') ilike '%/storage/v1/object/%'

union all

select
  'locations',
  id::text,
  'public_metadata.bank_support_document_url',
  public_metadata->>'bank_support_document_url'
from public.locations
where coalesce(public_metadata->>'bank_support_document_url', '') ilike '%supabase.co/storage/%'
   or coalesce(public_metadata->>'bank_support_document_url', '') ilike '%/storage/v1/object/%'

order by table_name, field_name, record_id;

-- -----------------------------------------------------------------------------
-- 6. Detail rows: support attachments that still require the Supabase bucket
-- -----------------------------------------------------------------------------
select
  id,
  ticket_id,
  message_id,
  uploaded_by,
  file_name,
  file_path,
  file_type,
  file_size,
  created_at
from public.support_ticket_attachments
order by created_at desc;

-- -----------------------------------------------------------------------------
-- 7. Detail rows: legacy bucket object inventory
-- -----------------------------------------------------------------------------
select
  bucket_id,
  name as object_name,
  created_at,
  updated_at,
  metadata
from storage.objects
where bucket_id in (
  'Organizations-Logos',
  'store-assets',
  'support-attachments',
  'cfd-images',
  'merchant-logos'
)
order by bucket_id, created_at desc;
