# Le Noël des Darons

Secret Santa en une page. Chacun ouvre le lien, choisit son prénom, lance le tirage
et découvre à qui il offre un cadeau. Personne ne voit le résultat des autres.

## Principe

- **Le tirage est calculé à l'avance**, dans une base Supabase, par la fonction `generer_tirage()` :
  personne ne se tire soi-même, les couples ne se tirent pas entre eux, chacun offre et reçoit une fois.
- **Les tables ne sont jamais lisibles depuis le navigateur.** La page n'appelle que deux fonctions :
  `liste_darons()` (les prénoms et s'ils ont déjà tiré) et `tirer(prénom, jeton)` (la cible d'un prénom).
- **Un prénom ne se tire qu'une fois.** Au premier tirage, la base attache le prénom au « jeton »
  du téléphone (un identifiant aléatoire gardé dans le navigateur). Ensuite, seul ce téléphone peut relire
  le résultat, et ce téléphone ne peut plus tirer pour un autre prénom.
- **Le résultat est gardé sur le téléphone** : en rouvrant le lien, il s'affiche directement, même sans réseau.

Fichiers :

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | La page (aucun framework, aucun build) |
| `sw.js` | Copie locale de la page, pour la rouvrir sans réseau |
| `supabase/schema.sql` | Tables, droits et fonctions (sans prénoms) |
| `assets/` | Vignette et polices (Lobster, Bebas Neue, Barlow : licence SIL OFL, via Fontsource) |

Les prénoms et les couples ne sont pas dans ce dépôt : ils ont été insérés directement dans la base.

## Libérer un prénom pris par erreur

Dans le dashboard Supabase, projet `secret-santa`, éditeur SQL :

```sql
select public.liberer('Prénom exact');
```

Le prénom redevient libre ; sa cible ne change pas. La personne relance le tirage depuis son téléphone.
Cette fonction n'est pas appelable depuis le site.

## Mise en service (une seule fois)

Dans l'éditeur SQL, libérer chaque prénom utilisé pendant les essais, puis :

```sql
select public.generer_tirage();
```

Vérifier **uniquement par agrégats**, sans jamais afficher la colonne `cible` :

```sql
select count(*) filter (where cible is null), count(distinct cible), count(*) filter (where cible = prenom)
from public.darons;                                   -- attendu : 0, 12, 0

select count(*) from public.darons d join public.exclusions e
  on (d.prenom = e.a and d.cible = e.b) or (d.prenom = e.b and d.cible = e.a);   -- attendu : 0
```

À partir de là, ne plus jamais lire `cible` : ni `select *`, ni export, ni ouverture de la table dans le dashboard.

## Limites

- Rien ne prouve qu'on est bien la personne dont on clique le prénom. Si quelqu'un tire à la place d'un autre,
  la victime trouve son prénom grisé : Pierre le libère, et celui qui a triché connaît une attribution.
- Le résultat se relit seulement sur le téléphone et le navigateur qui ont tiré.
- Pierre a les clés de la base : le secret vis-à-vis de lui repose sur sa parole.
- Offre gratuite Supabase : un projet sans activité pendant une semaine est mis en pause.
  Les résultats déjà tirés restent visibles sur les téléphones ; pour un nouveau tirage, Pierre réveille le projet depuis le dashboard.
