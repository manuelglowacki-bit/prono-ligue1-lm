-- ============================================================
-- LES ADRESSES MAIL DES JOUEURS, POUR L'ORGANISATEUR SEUL
-- ============================================================
-- Les adresses vivent dans auth.users, que le navigateur ne peut pas lire —
-- et c'est tres bien ainsi. Cette fonction en ouvre une porte etroite :
--
--   * `security definer` : elle lit auth.users avec les droits du
--     proprietaire, pas ceux de l'appelant ;
--   * elle REFUSE quiconque n'est pas admin, en verifiant profiles.is_admin
--     pour l'appelant courant — pas un drapeau envoye par le client ;
--   * elle ne renvoie QUE l'identifiant et l'adresse. Ni mot de passe, ni
--     jeton, ni metadonnee.
--
-- `search_path` est fige : sans cela, un schema pose devant `public` par un
-- appelant pourrait faire pointer `profiles` vers une table a lui et faire
-- repondre "oui" au controle d'admin.
-- ============================================================

create or replace function public.emails_des_joueurs()
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Reserve a l''organisateur.'
      using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.email is not null;
end;
$fn$;

-- Personne par defaut, puis les comptes connectes — le controle d'admin se
-- fait DANS la fonction, ou il ne peut pas etre contourne.
revoke all on function public.emails_des_joueurs() from public;
grant execute on function public.emails_des_joueurs() to authenticated;
