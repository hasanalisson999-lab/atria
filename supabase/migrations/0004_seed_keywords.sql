-- Signal: seed keywords x countries (editable later on the Tracking page).
-- EU countries are included because the official Meta API only returns commercial ads delivered in the EU.
insert into public.keywords (user_id, term, country, source, status)
select null, t.term, c.country, 'seed', 'active'
from unnest(array[
  'gym shorts', 'gym wear', 'activewear', 'athleisure', 'compression shirt', 'pump cover',
  'oversized gym tee', 'workout leggings', 'sports bra', 'seamless set', 'lifting straps',
  'gym bag', 'pre workout', 'protein powder', 'creatine', 'whey', 'recovery', 'running gear',
  'training shoes', 'fitness apparel', 'bodybuilding'
]) as t(term)
cross join unnest(array['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NL', 'SE', 'IE']) as c(country)
on conflict do nothing;
