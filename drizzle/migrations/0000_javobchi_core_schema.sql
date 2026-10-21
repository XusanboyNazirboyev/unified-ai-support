
create type public.channel_type as enum ('telegram','instagram','whatsapp');
create type public.conversation_mode as enum ('ai','human');
create type public.conversation_status as enum ('open','pending','resolved');
create type public.message_role as enum ('customer','ai','operator','system');

-- AI agent settings (one row per workspace owner)
create table public.agent_settings (
  owner_id uuid primary key default auth.uid(),
  agent_name text not null default 'Malika',
  company_name text not null default 'Mening kompaniyam',
  tone text not null default 'samimiy',
  instructions text not null default '',
  handover_keywords text[] not null default array['operator','odam bilan','menejer'],
  is_live boolean not null default false,
  require_verification boolean not null default true,
  crm_provider text not null default 'builtin',
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.agent_settings to authenticated;
grant all on public.agent_settings to service_role;
alter table public.agent_settings enable row level security;
create policy "own agent settings select" on public.agent_settings for select to authenticated using (owner_id = auth.uid());
create policy "own agent settings insert" on public.agent_settings for insert to authenticated with check (owner_id = auth.uid());
create policy "own agent settings update" on public.agent_settings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own agent settings delete" on public.agent_settings for delete to authenticated using (owner_id = auth.uid());

-- Knowledge base
create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null,
  category text not null default 'faq',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kb_articles_owner_idx on public.kb_articles(owner_id);
grant select, insert, update, delete on public.kb_articles to authenticated;
grant all on public.kb_articles to service_role;
alter table public.kb_articles enable row level security;
create policy "own kb select" on public.kb_articles for select to authenticated using (owner_id = auth.uid());
create policy "own kb insert" on public.kb_articles for insert to authenticated with check (owner_id = auth.uid());
create policy "own kb update" on public.kb_articles for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own kb delete" on public.kb_articles for delete to authenticated using (owner_id = auth.uid());

-- Built-in CRM: customers
create table public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  full_name text not null,
  phone text,
  email text,
  telegram_username text,
  instagram_handle text,
  whatsapp_phone text,
  city text,
  segment text not null default 'oddiy',
  notes text,
  created_at timestamptz not null default now()
);
create index crm_customers_owner_idx on public.crm_customers(owner_id);
grant select, insert, update, delete on public.crm_customers to authenticated;
grant all on public.crm_customers to service_role;
alter table public.crm_customers enable row level security;
create policy "own customers select" on public.crm_customers for select to authenticated using (owner_id = auth.uid());
create policy "own customers insert" on public.crm_customers for insert to authenticated with check (owner_id = auth.uid());
create policy "own customers update" on public.crm_customers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own customers delete" on public.crm_customers for delete to authenticated using (owner_id = auth.uid());

-- Built-in CRM: orders
create table public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  order_number text not null,
  status text not null default 'yangi',
  items text not null default '',
  total numeric not null default 0,
  currency text not null default 'UZS',
  delivery_address text,
  expected_delivery date,
  created_at timestamptz not null default now()
);
create index crm_orders_owner_idx on public.crm_orders(owner_id);
create index crm_orders_customer_idx on public.crm_orders(customer_id);
grant select, insert, update, delete on public.crm_orders to authenticated;
grant all on public.crm_orders to service_role;
alter table public.crm_orders enable row level security;
create policy "own orders select" on public.crm_orders for select to authenticated using (owner_id = auth.uid());
create policy "own orders insert" on public.crm_orders for insert to authenticated with check (owner_id = auth.uid());
create policy "own orders update" on public.crm_orders for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own orders delete" on public.crm_orders for delete to authenticated using (owner_id = auth.uid());

-- Unified inbox: conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  channel public.channel_type not null,
  contact_name text not null,
  contact_handle text,
  customer_id uuid references public.crm_customers(id) on delete set null,
  mode public.conversation_mode not null default 'ai',
  status public.conversation_status not null default 'open',
  handover_reason text,
  last_message_preview text,
  last_message_at timestamptz not null default now(),
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index conversations_owner_idx on public.conversations(owner_id, last_message_at desc);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "own conversations select" on public.conversations for select to authenticated using (owner_id = auth.uid());
create policy "own conversations insert" on public.conversations for insert to authenticated with check (owner_id = auth.uid());
create policy "own conversations update" on public.conversations for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own conversations delete" on public.conversations for delete to authenticated using (owner_id = auth.uid());

-- Unified inbox: messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  response_ms integer,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
create index messages_owner_idx on public.messages(owner_id, created_at desc);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "own messages select" on public.messages for select to authenticated using (owner_id = auth.uid());
create policy "own messages insert" on public.messages for insert to authenticated with check (owner_id = auth.uid());
create policy "own messages update" on public.messages for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own messages delete" on public.messages for delete to authenticated using (owner_id = auth.uid());

-- Channel connections
create table public.channel_connections (
  owner_id uuid not null default auth.uid(),
  channel public.channel_type not null,
  status text not null default 'disconnected',
  account_name text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, channel)
);
grant select, insert, update, delete on public.channel_connections to authenticated;
grant all on public.channel_connections to service_role;
alter table public.channel_connections enable row level security;
create policy "own channels select" on public.channel_connections for select to authenticated using (owner_id = auth.uid());
create policy "own channels insert" on public.channel_connections for insert to authenticated with check (owner_id = auth.uid());
create policy "own channels update" on public.channel_connections for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own channels delete" on public.channel_connections for delete to authenticated using (owner_id = auth.uid());

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;

-- Demo workspace seeding for every new account
create or replace function public.seed_demo_workspace(_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_dilshod uuid; c_malika uuid; c_jasur uuid; c_nilufar uuid; c_bekzod uuid;
  conv uuid;
  i integer;
  ch public.channel_type;
  ts timestamptz;
  q text[] := array[
    'Yetkazib berish necha kun oladi?',
    'Click orqali to''lasa bo''ladimi?',
    'Kafolat muddati qancha?',
    'Do''kon soat nechigacha ishlaydi?',
    'Promo kod bormi?',
    'Viloyatga yetkazib berasizlarmi?',
    'Mahsulotni qaytarsa bo''ladimi?',
    'Nasiyaga olsa bo''ladimi?'
  ];
  a text[] := array[
    'Toshkent bo''ylab 1 kun ichida, viloyatlarga 2–4 kun ichida yetkazib beramiz.',
    'Ha, Click, Payme, Uzum, Humo/Uzcard kartalari va naqd pul orqali to''lash mumkin.',
    'Smartfonlarga 12 oy, maishiy texnikaga 24 oy, aksessuarlarga 3 oy kafolat beriladi.',
    'Dushanba–shanba 09:00–20:00, yakshanba 10:00–18:00 ishlaymiz.',
    'Oktabr oyida KUZ15 promo kodi bilan aksessuarlarga 15% chegirma bor.',
    'Ha, barcha viloyatlarga 45 000 so''m evaziga 2–4 kunda yetkazamiz.',
    'Ha, 10 kun ichida, qadoq buzilmagan va chek bo''lsa qaytarish mumkin.',
    'Ha, Uzum Nasiya orqali 3, 6 yoki 12 oyga muddatli to''lov mumkin.'
  ];
  names text[] := array['Sardor','Gulnora','Azizbek','Shahnoza','Otabek','Madina','Javlon','Kamola','Ulug''bek','Zarina','Rustam','Feruza'];
  src jsonb;
begin
  insert into public.agent_settings (owner_id, agent_name, company_name, tone, instructions, is_live)
  values (_owner, 'Malika', 'TezMarket', 'samimiy',
    'Biz TezMarket — Toshkentdagi elektronika va maishiy texnika onlayn do''konimiz. Mijozlarga qisqa, aniq va xushmuomala javob ber. Narx va shartlarni faqat bilimlar bazasidan ol. Mijoz o''zbek, rus yoki ingliz tilida yozsa, o''sha tilda javob ber.',
    true)
  on conflict (owner_id) do nothing;

  insert into public.channel_connections (owner_id, channel, status, account_name) values
    (_owner, 'telegram', 'demo', '@tezmarket_bot'),
    (_owner, 'instagram', 'demo', '@tezmarket.uz'),
    (_owner, 'whatsapp', 'demo', '+998 71 200 00 00')
  on conflict do nothing;

  insert into public.kb_articles (owner_id, title, category, content) values
  (_owner, 'Yetkazib berish shartlari', 'faq', 'Toshkent shahri bo''ylab buyurtmalar 1 kun ichida yetkaziladi. 500 000 so''mdan yuqori buyurtmalarga Toshkent bo''ylab yetkazib berish bepul, undan past bo''lsa 25 000 so''m. Viloyatlarga yetkazib berish 2–4 ish kuni, narxi 45 000 so''m. Kuryerlar har kuni 09:00–21:00 oralig''ida ishlaydi. Kuryer yetib borishdan 1 soat oldin qo''ng''iroq qiladi.'),
  (_owner, 'To''lov usullari', 'faq', 'To''lov usullari: Click, Payme, Uzum Bank, Humo va Uzcard kartalari, kuryerga naqd pul. Muddatli to''lov: Uzum Nasiya orqali 3, 6 yoki 12 oyga, boshlang''ich to''lovsiz. Nasiya uchun pasport va Uzum ilovasida tasdiqlangan akkaunt kerak.'),
  (_owner, 'Qaytarish va almashtirish', 'qoidalar', 'Mahsulotni qabul qilgandan keyin 10 kun ichida qaytarish yoki almashtirish mumkin: qadoq buzilmagan, chek yoki buyurtma raqami bo''lishi shart. Elektronikada zavod nuqsoni aniqlansa 14 kun ichida almashtiriladi. Pul 3–5 ish kuni ichida to''lov qilingan kartaga qaytariladi. Ichki kiyim, quloqchinlar va ochilgan dasturiy ta''minot qaytarilmaydi.'),
  (_owner, 'Kafolat', 'qoidalar', 'Kafolat muddatlari: smartfon va planshetlar — 12 oy, maishiy texnika (konditsioner, muzlatgich, kir yuvish mashinasi) — 24 oy, aksessuarlar — 3 oy. Kafolat bo''yicha servis markazi: Toshkent, Chilonzor tumani, Bunyodkor ko''chasi 12, du–sha 09:00–18:00. Konditsioner o''rnatish xizmati alohida — narxi 350 000 so''mdan, operator orqali buyurtma qilinadi.'),
  (_owner, 'Mashhur mahsulotlar narxlari', 'narxlar', 'Narxlar 2026-yil oktabr holatiga: Samsung Galaxy A56 8/256 — 4 890 000 so''m; iPhone 16 128GB — 11 990 000 so''m; Xiaomi Redmi Note 14 8/256 — 2 650 000 so''m; Apple AirPods Pro 2 — 2 990 000 so''m; Artel konditsioner 12 (inverter) — 4 300 000 so''m; Samsung smart soat Galaxy Watch 7 — 3 450 000 so''m. Boshqa mahsulotlar narxini operator aniqlab beradi.'),
  (_owner, 'Ish vaqti va manzil', 'faq', 'Do''kon manzili: Toshkent, Yunusobod tumani, Amir Temur ko''chasi 108 (Minor metrosi yonida). Ish vaqti: dushanba–shanba 09:00–20:00, yakshanba 10:00–18:00. Qo''llab-quvvatlash telefoni: +998 71 200 00 00. Telegram: @tezmarket_bot, Instagram: @tezmarket.uz.'),
  (_owner, 'Aksiyalar va promo kodlar', 'narxlar', '"Kuzgi chegirma" aksiyasi 1–31 oktabr: barcha aksessuarlarga 15% chegirma, promo kod KUZ15. Birinchi buyurtma uchun 50 000 so''m chegirma (300 000 so''mdan yuqori buyurtmalarga). Chegirmalar bir-biriga qo''shilmaydi.'),
  (_owner, 'Buyurtma berish tartibi', 'hujjat', 'Buyurtmani sayt, Telegram bot yoki +998 71 200 00 00 telefoni orqali berish mumkin. Buyurtma raqami TM-XXXX formatida SMS orqali yuboriladi. Buyurtma holatlari: yangi, to''lov kutilmoqda, tayyorlanmoqda, yo''lda, yetkazildi, bekor qilindi. Yetkazilgunga qadar manzilni o''zgartirish mumkin.');

  insert into public.crm_customers (owner_id, full_name, phone, email, telegram_username, city, segment, notes)
  values (_owner, 'Dilshod Karimov', '+998901234567', 'dilshod.k@mail.uz', 'dilshod_k', 'Toshkent', 'VIP', 'Doimiy mijoz, 2024-yildan beri')
  returning id into c_dilshod;
  insert into public.crm_customers (owner_id, full_name, phone, instagram_handle, city, segment)
  values (_owner, 'Malika Yusupova', '+998935556677', 'malika.yusupova', 'Samarqand', 'oddiy')
  returning id into c_malika;
  insert into public.crm_customers (owner_id, full_name, phone, whatsapp_phone, city, segment)
  values (_owner, 'Jasur Toshmatov', '+998977778899', '+998977778899', 'Toshkent', 'oddiy')
  returning id into c_jasur;
  insert into public.crm_customers (owner_id, full_name, phone, telegram_username, city, segment, notes)
  values (_owner, 'Nilufar Rahimova', '+998998887766', 'nilu_r', 'Buxoro', 'yangi', 'Birinchi buyurtma')
  returning id into c_nilufar;
  insert into public.crm_customers (owner_id, full_name, phone, instagram_handle, city, segment)
  values (_owner, 'Bekzod Aliyev', '+998946543210', 'bekzod.aliev', 'Namangan', 'oddiy')
  returning id into c_bekzod;

  insert into public.crm_orders (owner_id, customer_id, order_number, status, items, total, delivery_address, expected_delivery, created_at) values
  (_owner, c_dilshod, 'TM-1042', 'yo''lda', 'Samsung Galaxy A56 8/256 (qora)', 4890000, 'Toshkent, Mirzo Ulug''bek tumani, Buyuk Ipak Yo''li 45', current_date + 1, now() - interval '2 days'),
  (_owner, c_dilshod, 'TM-1038', 'yetkazildi', 'Apple AirPods Pro 2', 2990000, 'Toshkent, Mirzo Ulug''bek tumani, Buyuk Ipak Yo''li 45', current_date - 8, now() - interval '10 days'),
  (_owner, c_malika, 'TM-1051', 'tayyorlanmoqda', 'Artel konditsioner 12 (inverter)', 4300000, 'Samarqand, Registon ko''chasi 7', current_date + 3, now() - interval '1 day'),
  (_owner, c_jasur, 'TM-1047', 'yetkazildi', 'Xiaomi Redmi Note 14 8/256 + silikon g''ilof', 2740000, 'Toshkent, Sergeli tumani, Yangi Sergeli 21', current_date - 3, now() - interval '6 days'),
  (_owner, c_nilufar, 'TM-1055', 'to''lov kutilmoqda', 'iPhone 16 128GB (oq)', 11990000, 'Buxoro, Navoiy shoh ko''chasi 30', current_date + 4, now() - interval '5 hours'),
  (_owner, c_bekzod, 'TM-1049', 'bekor qilindi', 'Samsung Galaxy Watch 7', 3450000, 'Namangan, Davlatobod 3', null, now() - interval '4 days');

  -- Historical conversations for analytics
  for i in 1..36 loop
    ch := (array['telegram','instagram','whatsapp']::public.channel_type[])[1 + (i % 3)];
    ts := now() - make_interval(hours => 14 + i * 9);
    insert into public.conversations (owner_id, channel, contact_name, contact_handle, mode, status, last_message_preview, last_message_at, created_at)
    values (_owner, ch, names[1 + (i % 12)], null,
            case when i % 7 = 0 then 'human'::public.conversation_mode else 'ai'::public.conversation_mode end,
            'resolved', a[1 + (i % 8)], ts + interval '3 seconds', ts)
    returning id into conv;
    insert into public.messages (owner_id, conversation_id, role, content, created_at)
    values (_owner, conv, 'customer', q[1 + (i % 8)], ts);
    src := jsonb_build_array(jsonb_build_object('type','kb','label',
      (array['Yetkazib berish shartlari','To''lov usullari','Kafolat','Ish vaqti va manzil','Aksiyalar va promo kodlar','Yetkazib berish shartlari','Qaytarish va almashtirish','To''lov usullari'])[1 + (i % 8)]));
    insert into public.messages (owner_id, conversation_id, role, content, sources, response_ms, created_at)
    values (_owner, conv, 'ai', a[1 + (i % 8)], src, 900 + ((i * 337) % 2600), ts + interval '3 seconds');
    if i % 7 = 0 then
      insert into public.messages (owner_id, conversation_id, role, content, response_ms, created_at)
      values (_owner, conv, 'operator', 'Qo''shimcha savollaringiz bo''lsa, yozing — yordam beramiz!', 240000 + ((i * 7919) % 600000), ts + interval '6 minutes');
    end if;
  end loop;

  -- Live demo conversations
  insert into public.conversations (owner_id, channel, contact_name, contact_handle, customer_id, mode, status, last_message_preview, last_message_at, unread_count)
  values (_owner, 'telegram', 'Dilshod Karimov', '@dilshod_k', c_dilshod, 'ai', 'open', 'TM-1042 buyurtmangiz hozir yo''lda…', now() - interval '12 minutes', 0)
  returning id into conv;
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'customer', 'Assalomu alaykum! TM-1042 buyurtmam qachon keladi?', now() - interval '12 minutes 4 seconds');
  insert into public.messages (owner_id, conversation_id, role, content, sources, response_ms, created_at) values
  (_owner, conv, 'ai', 'Va alaykum assalom, Dilshod! TM-1042 buyurtmangiz (Samsung Galaxy A56) hozir yo''lda — ertaga yetkazib berilishi kutilmoqda. Kuryer yetib borishdan 1 soat oldin qo''ng''iroq qiladi.',
   jsonb_build_array(jsonb_build_object('type','crm','label','Buyurtma TM-1042'), jsonb_build_object('type','kb','label','Yetkazib berish shartlari')), 1840, now() - interval '12 minutes');

  insert into public.conversations (owner_id, channel, contact_name, contact_handle, customer_id, mode, status, handover_reason, last_message_preview, last_message_at, unread_count)
  values (_owner, 'instagram', 'Malika Yusupova', '@malika.yusupova', c_malika, 'human', 'pending', 'Konditsioner o''rnatish narxi va vaqtini operator kelishishi kerak', 'Konditsionerni o''rnatib ham berasizlarmi?', now() - interval '25 minutes', 1)
  returning id into conv;
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'customer', 'Salom! Konditsionerni o''rnatib ham berasizlarmi? Samarqandga usta keladimi?', now() - interval '26 minutes');
  insert into public.messages (owner_id, conversation_id, role, content, sources, response_ms, created_at) values
  (_owner, conv, 'ai', 'Salom, Malika! O''rnatish xizmati bor — narxi 350 000 so''mdan boshlanadi. Samarqandga usta yuborish vaqtini operatorimiz aniqlab beradi, sizni hoziroq ulayman.',
   jsonb_build_array(jsonb_build_object('type','kb','label','Kafolat')), 2210, now() - interval '25 minutes 50 seconds');
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'system', 'Suhbat operatorga uzatildi: Konditsioner o''rnatish narxi va vaqtini operator kelishishi kerak', now() - interval '25 minutes 49 seconds'),
  (_owner, conv, 'customer', 'Rahmat, kutaman', now() - interval '25 minutes');

  insert into public.conversations (owner_id, channel, contact_name, contact_handle, customer_id, mode, status, last_message_preview, last_message_at)
  values (_owner, 'whatsapp', 'Jasur Toshmatov', '+998977778899', c_jasur, 'ai', 'resolved', 'Ha, 10 kun ichida qaytarish mumkin…', now() - interval '2 hours')
  returning id into conv;
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'customer', 'Telefon g''ilofi to''g''ri kelmadi, qaytarsam bo''ladimi?', now() - interval '2 hours 3 seconds');
  insert into public.messages (owner_id, conversation_id, role, content, sources, response_ms, created_at) values
  (_owner, conv, 'ai', 'Ha, Jasur, 10 kun ichida qaytarish mumkin: qadoq buzilmagan bo''lsin va TM-1047 buyurtma raqamini ko''rsating. Pul 3–5 ish kunida kartangizga qaytadi.',
   jsonb_build_array(jsonb_build_object('type','kb','label','Qaytarish va almashtirish'), jsonb_build_object('type','crm','label','Buyurtma TM-1047')), 1530, now() - interval '2 hours');

  insert into public.conversations (owner_id, channel, contact_name, contact_handle, mode, status, last_message_preview, last_message_at, unread_count)
  values (_owner, 'telegram', 'Aziz', '@aziz_uz', 'ai', 'open', 'iPhone 16 128GB narxi 11 990 000 so''m…', now() - interval '40 minutes', 0)
  returning id into conv;
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'customer', 'iPhone 16 qancha turadi? Nasiyaga olsa bo''ladimi?', now() - interval '40 minutes 3 seconds');
  insert into public.messages (owner_id, conversation_id, role, content, sources, response_ms, created_at) values
  (_owner, conv, 'ai', 'iPhone 16 128GB narxi 11 990 000 so''m. Ha, Uzum Nasiya orqali 3, 6 yoki 12 oyga boshlang''ich to''lovsiz olish mumkin — pasport va tasdiqlangan Uzum akkaunti kerak.',
   jsonb_build_array(jsonb_build_object('type','kb','label','Mashhur mahsulotlar narxlari'), jsonb_build_object('type','kb','label','To''lov usullari')), 2050, now() - interval '40 minutes');

  insert into public.conversations (owner_id, channel, contact_name, contact_handle, customer_id, mode, status, handover_reason, last_message_preview, last_message_at, unread_count)
  values (_owner, 'instagram', 'Bekzod Aliyev', '@bekzod.aliev', c_bekzod, 'human', 'pending', 'Mijoz operator so''radi', 'Operator bilan gaplashmoqchiman', now() - interval '6 minutes', 2)
  returning id into conv;
  insert into public.messages (owner_id, conversation_id, role, content, created_at) values
  (_owner, conv, 'customer', 'Nega TM-1049 buyurtmam bekor qilindi?', now() - interval '7 minutes'),
  (_owner, conv, 'customer', 'Operator bilan gaplashmoqchiman', now() - interval '6 minutes 2 seconds'),
  (_owner, conv, 'system', 'Suhbat operatorga uzatildi: Mijoz operator so''radi', now() - interval '6 minutes');
end;
$$;

revoke all on function public.seed_demo_workspace(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_demo_workspace(new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user_workspace() from public, anon, authenticated;

create trigger on_auth_user_created_workspace
after insert on auth.users
for each row execute function public.handle_new_user_workspace();
