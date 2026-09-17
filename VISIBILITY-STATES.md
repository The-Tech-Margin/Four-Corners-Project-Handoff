# Project Visibility States

## Two-State System (Implemented)

Projects use a two-field visibility model that separates "shareable via link" from "discoverable in gallery."

### Schema

```sql
-- projects table has two boolean fields:
published   BOOLEAN DEFAULT false   -- Controls share link access
in_gallery  BOOLEAN DEFAULT false   -- Controls gallery discovery

-- Constraint: in_gallery requires published
-- (enforced in migration 005_security_rls_policies.sql)

-- Partial index for gallery queries
CREATE INDEX idx_projects_in_gallery ON projects(in_gallery) WHERE in_gallery = true;
```

Added in migration `006_add_parent_project_linking.sql`.

### Visibility Matrix

| published | in_gallery | Share Link Access   | Gallery Visibility | Use Case                   |
| --------- | ---------- | ------------------- | ------------------ | -------------------------- |
| `false`   | `false`    | Private             | Hidden             | Draft/Private work         |
| `true`    | `false`    | Anyone with link    | Hidden             | Shareable but not promoted |
| `true`    | `true`     | Anyone with link    | Public gallery     | Fully public work          |
| `false`   | `true`     | Invalid state       | N/A                | Prevented by constraint    |

### User Workflow

**Step 1: Make Shareable**

```
User clicks "Make Public" → sets published=true
- Project can be shared via link
- Does NOT appear in gallery yet
- Toast: "Project is now shareable via link"
```

**Step 2: Add to Gallery (Optional)**

```
User clicks "Add to Gallery" → sets in_gallery=true
- Requires published=true first
- Project appears in public gallery
- Toast: "Project added to gallery"
```

### Queries

**Gallery Page** (`app/gallery/page.tsx`):

```typescript
const { data } = await supabase
  .from("projects")
  .select("*")
  .eq("published", true)
  .eq("in_gallery", true)
  .order("created_at", { ascending: false });
```

**View Page — Share Links** (`app/view/[slug]/page.tsx`):

```typescript
const { data } = await supabase
  .from("projects")
  .select("*")
  .eq("published", true);
// in_gallery doesn't matter for direct link access
```

**Dashboard** (`app/dashboard/`):

```typescript
// Shows both states
{ project.published ? "Shareable" : "Private" }
{ project.in_gallery && " • In Gallery" }
```

### EditorProps Integration

The layout mode system passes visibility state through `EditorProps`:

```typescript
interface EditorProps {
  isPublished: boolean;
  inGallery: boolean;
  onPublishToggle: (published: boolean) => void;
  onGalleryToggle: (inGallery: boolean) => void;
}
```

Both scroll and sketchboard modes receive these props from the page shell.

### UI Terminology

| Action          | Effect               |
| --------------- | -------------------- |
| Make Shareable  | `published = true`   |
| Make Private    | `published = false`  |
| Add to Gallery  | `in_gallery = true`  |
| Remove from Gallery | `in_gallery = false` |

### Design Rationale

This follows the unlisted/public pattern used by platforms like YouTube (Unlisted vs Public) and GitHub (Public repo vs Trending). Benefits:

1. **User Control:** Authors can share work privately before promoting to gallery
2. **Quality Control:** Not every shareable project needs gallery visibility
3. **Privacy Gradation:** Private → Shareable → Public Gallery
4. **Spam Prevention:** Gallery is curated by authors opting in
5. **Performance:** Gallery queries only filter gallery-flagged projects via partial index
