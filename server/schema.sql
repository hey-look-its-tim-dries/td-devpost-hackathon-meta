-- spec 8.4, the two tables M3 uses
create table if not exists player (
  id text primary key,
  token_hash text not null unique,
  created_at integer not null,
  consent_version integer not null default 1,
  age_band text not null default '16+',
  name text,
  palette integer not null default 0
);
create table if not exists hand (
  id text primary key,
  player_id text not null references player(id) on delete cascade,
  side text not null check (side in ('L', 'R')),
  palm_dna blob not null,
  prints blob not null,
  route text not null,
  gen integer not null,
  x real, z real, rot real,
  placed_at integer,
  founder integer not null default 0
);
create index if not exists hand_placed on hand(placed_at);

-- spec 8.4: names given to places (handbits by their owner, summits by the first to name them)
create table if not exists place_name (
  hand_id text not null,
  feature text not null,
  name text not null,
  by_player text not null,
  at integer not null,
  primary key (hand_id, feature)
);

-- spec 8.4: the Community Hand's slots, and the world's events (lays, washes, names, seals)
create table if not exists community_slot (
  community_no integer not null,
  slot text not null,
  hand_id text not null,
  player_id text not null,
  code text not null,
  palette integer not null default 0,
  at integer not null,
  primary key (community_no, slot)
);
create unique index if not exists community_once on community_slot(community_no, player_id);
create table if not exists event (
  id integer primary key autoincrement,
  at integer not null,
  kind text not null,
  hand_id text,
  data text
);

-- spec 8.4: rivers of two Hands that meet (watersheds)
create table if not exists confluence (
  hand_a text not null,
  hand_b text not null,
  at integer not null,
  primary key (hand_a, hand_b)
);

-- Bloom: groves planted on the Hands (x, y in the Hand's own metres), watered by anyone
create table if not exists plant (
  id integer primary key autoincrement,
  hand_id text not null,
  bit integer not null,
  x real not null,
  y real not null,
  sp integer not null,
  stage integer not null default 0,
  tended integer not null,
  big integer not null default 0,
  hab text not null default 'dune',
  by_hash text not null,
  at integer not null
);
create index if not exists plant_plot on plant (hand_id, bit);

-- profiles: a gardener's pouch by device ('dev:<token hash>') or by account ('fb:<hash of the app-scoped user id>')
create table if not exists profile (
  id text primary key,
  data text not null,
  updated integer not null
);
-- a device signed in to an account shares that account's pouch
create table if not exists account (
  token_hash text primary key,
  account text not null,
  at integer not null
);
