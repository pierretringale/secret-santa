-- Le Noël des Darons : structure et fonctions.
-- Aucun prénom ici : ils s'insèrent par une requête directe dans l'éditeur SQL.
-- Principe : les tables ne sont jamais lisibles depuis le navigateur.
-- Le navigateur n'appelle que deux fonctions, liste_darons() et tirer().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.darons (
  id       smallint primary key,
  prenom   text not null unique,
  ordre    smallint not null,
  cible    text,                 -- le prénom tiré : la donnée secrète
  jeton    uuid unique,          -- identifiant du téléphone qui a tiré
  tire_le  timestamptz
);

create table public.exclusions (
  a text not null references public.darons (prenom),
  b text not null references public.darons (prenom),
  primary key (a, b),
  check (a <> b)
);

alter table public.darons     enable row level security;
alter table public.exclusions enable row level security;
-- Aucune policy : personne ne lit ni n'écrit ces tables via l'API.

revoke all on table public.darons     from public, anon, authenticated;
revoke all on table public.exclusions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- liste_darons() : les prénoms et s'ils ont déjà tiré. Jamais cible ni jeton.
-- ---------------------------------------------------------------------------

create or replace function public.liste_darons()
returns table (prenom text, deja_tire boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.prenom, d.jeton is not null
  from public.darons d
  order by d.ordre;
$$;

-- ---------------------------------------------------------------------------
-- tirer(p_prenom, p_jeton) : renvoie la cible d'un prénom, une seule fois,
-- puis seulement au téléphone (jeton) qui l'a tirée.
-- ---------------------------------------------------------------------------

create or replace function public.tirer(p_prenom text, p_jeton uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne public.darons%rowtype;
begin
  -- Sans jeton, n'importe qui relirait n'importe quelle cible : on refuse.
  if p_jeton is null then
    raise exception 'JETON_MANQUANT';
  end if;

  -- 1. Prénom inconnu (la ligne est verrouillée jusqu'à la fin de l'appel)
  select * into v_ligne
  from public.darons
  where prenom = p_prenom
  for update;
  if not found then
    raise exception 'PRENOM_INCONNU';
  end if;

  -- 2. Tirage pas encore généré
  if v_ligne.cible is null then
    raise exception 'TIRAGE_PAS_PRET';
  end if;

  -- 3. Le même téléphone relit son résultat
  if v_ligne.jeton = p_jeton then
    return v_ligne.cible;
  end if;

  -- 4. Prénom déjà tiré par un autre téléphone
  if v_ligne.jeton is not null then
    raise exception 'DEJA_TIRE';
  end if;

  -- 5. Ce téléphone a déjà tiré pour un autre prénom
  if exists (select 1 from public.darons where jeton = p_jeton) then
    raise exception 'JETON_DEJA_UTILISE';
  end if;

  -- 6. Premier tirage : on attache le prénom à ce téléphone
  update public.darons
  set jeton = p_jeton, tire_le = now()
  where id = v_ligne.id;

  return v_ligne.cible;
exception
  -- Deux tirages simultanés avec le même jeton : la contrainte unique tranche.
  when unique_violation then
    raise exception 'JETON_DEJA_UTILISE';
end;
$$;

-- ---------------------------------------------------------------------------
-- generer_tirage() : calcule toutes les cibles. Lancée à la main, une fois.
-- Mélange les prénoms, vérifie les règles, recommence (1 000 essais au plus).
-- ---------------------------------------------------------------------------

create or replace function public.generer_tirage()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prenoms text[];
  v_cibles  text[];
  v_n       int;
  v_essai   int := 0;
  v_ok      boolean;
  i         int;
begin
  if exists (select 1 from public.darons where jeton is not null) then
    raise exception 'TIRAGE_DEJA_COMMENCE';
  end if;

  select array_agg(d.prenom order by d.ordre) into v_prenoms from public.darons d;
  v_n := coalesce(array_length(v_prenoms, 1), 0);
  if v_n < 2 then
    raise exception 'TIRAGE_IMPOSSIBLE';
  end if;

  loop
    v_essai := v_essai + 1;
    if v_essai > 1000 then
      raise exception 'TIRAGE_IMPOSSIBLE';
    end if;

    -- Une permutation des prénoms : chacun reçoit une fois et offre une fois.
    select array_agg(p order by gen_random_uuid()) into v_cibles
    from unnest(v_prenoms) as p;

    v_ok := true;
    for i in 1 .. v_n loop
      if v_cibles[i] = v_prenoms[i]
         or exists (
           select 1 from public.exclusions e
           where (e.a = v_prenoms[i] and e.b = v_cibles[i])
              or (e.a = v_cibles[i]  and e.b = v_prenoms[i])
         )
      then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit when v_ok;
  end loop;

  update public.darons d
  set cible = t.cible
  from unnest(v_prenoms, v_cibles) as t (prenom, cible)
  where d.prenom = t.prenom;
end;
$$;

-- ---------------------------------------------------------------------------
-- liberer(p_prenom) : détache un prénom pris par erreur. La cible ne change pas.
-- ---------------------------------------------------------------------------

create or replace function public.liberer(p_prenom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.darons
  set jeton = null, tire_le = null
  where prenom = p_prenom;
  if not found then
    raise exception 'PRENOM_INCONNU';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution : tout retirer, puis n'ouvrir que le strict nécessaire.
-- ---------------------------------------------------------------------------

revoke execute on function public.liste_darons()        from public, anon, authenticated;
revoke execute on function public.tirer(text, uuid)      from public, anon, authenticated;
revoke execute on function public.generer_tirage()       from public, anon, authenticated, service_role;
revoke execute on function public.liberer(text)          from public, anon, authenticated, service_role;

grant execute on function public.liste_darons()   to anon;
grant execute on function public.tirer(text, uuid) to anon;
