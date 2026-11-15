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
