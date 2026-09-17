/**
 * Presentational building blocks for the /docs pages.
 *
 * All colors resolve from the app's runtime --fc-* theme variables, so these
 * components inherit dark/light mode and persona palettes automatically.
 * Server components — no client JS required.
 */
import type { CSSProperties, ReactNode } from "react";
import styles from "../docs.module.css";
import type {
  DocCorner,
  DocCross,
  DocField,
  DocApi,
  DocStep,
  DocVisibility,
  DocVersion,
} from "../_data/docsData";

const cornerVar = (token: string) => `var(--fc-corner-${token})`;
const cssVars = (vars: Record<string, string>) => vars as unknown as CSSProperties;

export function Badge({ children, color }: { children: string; color?: string }) {
  return (
    <span className={styles.badge} style={color ? cssVars({ "--accent": color }) : undefined}>
      {children}
    </span>
  );
}

/** Section heading with a stable id and a hover-revealed, shareable anchor. */
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  const label = typeof children === "string" ? children : id;
  return (
    <h2 id={id} className={styles.sectionTitle}>
      <a href={`#${id}`} className={styles.sectionAnchor} aria-label={`Link to ${label}`}>
        {children}
        <span className={styles.sectionHash} aria-hidden>
          #
        </span>
      </a>
    </h2>
  );
}

export function CornerDiagram({ corners }: { corners: DocCorner[] }) {
  return (
    <div className={styles.diagram}>
      {corners.map((c) => (
        <div key={c.key} className={styles.diagramCell} style={cssVars({ "--cell": cornerVar(c.token) })}>
          <div className={styles.diagramGlyph}>{c.glyph}</div>
          <div className={styles.diagramLabel}>{c.label}</div>
          <div className={styles.diagramPos}>{c.position}</div>
        </div>
      ))}
    </div>
  );
}

function FieldTable({ fields }: { fields: DocField[] }) {
  if (!fields.length) return null;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Field</th>
          <th>Req.</th>
          <th>In the editor</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.key}>
            <td>
              <span className={styles.cardTitle} style={{ fontSize: "0.85rem" }}>{f.label}</span>
              {f.values?.length ? (
                <div className={styles.cardSub}>options: {f.values.join(" · ")}</div>
              ) : null}
            </td>
            <td>{f.required ? <span className={styles.req}>required</span> : "optional"}</td>
            <td>{f.placeholder ?? (f.iiif ? `Maps to IIIF “${f.iiif}”` : "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Full corner card with field reference (comprehensive / gated docs). */
export function CornerCard({ corner }: { corner: DocCorner }) {
  const color = cornerVar(corner.token);
  return (
    <section className={styles.card} style={cssVars({ "--accent": color })} id={corner.key}>
      <div className={styles.cardHead}>
        <Badge color={color}>{`${corner.glyph} ${corner.position}`}</Badge>
        <span className={styles.cardTitle}>{corner.label}</span>
        <span className={styles.cardSub}>{corner.subtitle}</span>
      </div>
      <p className={styles.cardBody}>{corner.whatItHolds}</p>
      <p className={styles.why}>Why it matters — {corner.whyItMatters}</p>
      <FieldTable fields={corner.fields} />
      {corner.note ? <p className={styles.note}>{corner.note}</p> : null}
    </section>
  );
}

/** Brief corner summary, no field tables (public framework overview). */
export function CornerSummary({ corner }: { corner: DocCorner }) {
  const color = cornerVar(corner.token);
  return (
    <div className={styles.card} style={cssVars({ "--accent": color })}>
      <div className={styles.cardHead}>
        <Badge color={color}>{corner.glyph}</Badge>
        <span className={styles.cardTitle}>{corner.label}</span>
        <span className={styles.cardSub}>{corner.subtitle}</span>
      </div>
      <p className={styles.cardBody}>{corner.whatItHolds}</p>
    </div>
  );
}

export function CrossCard({ item }: { item: DocCross }) {
  return (
    <section className={styles.card} id={item.key}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{item.label}</span>
      </div>
      <p className={styles.cardBody}>{item.note}</p>
      <FieldTable fields={item.fields} />
    </section>
  );
}

export function Steps({ steps }: { steps: DocStep[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((s) => (
        <li key={s.n} className={styles.step}>
          <span className={styles.stepNum}>{s.n}</span>
          <div>
            <div className={styles.stepTitle}>{s.title}</div>
            <div className={styles.stepBody}>{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VisibilityTable({ rows }: { rows: DocVisibility[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>State</th>
          <th>published</th>
          <th>in_gallery</th>
          <th>What it means</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.state}>
            <td><span className={styles.cardTitle} style={{ fontSize: "0.85rem" }}>{r.state}</span></td>
            <td className={styles.mono}>{String(r.published)}</td>
            <td className={styles.mono}>{String(r.inGallery)}</td>
            <td>{r.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ApiTable({ rows }: { rows: DocApi[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Returns</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.path}>
            <td className={styles.mono}>
              <span className={styles.method}>{r.method}</span>
              {r.path}
            </td>
            <td>{r.summary || r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className={styles.callout}>{children}</div>;
}

/** Release history list (newest first). Each entry is its own anchor target. */
export function VersionHistory({ versions }: { versions: DocVersion[] }) {
  return (
    <div>
      {versions.map((v) => (
        <section key={v.version} id={`v-${v.version}`} className={styles.card}>
          <div className={styles.cardHead}>
            <Badge>{v.version}</Badge>
            <span className={styles.cardTitle} style={{ fontSize: "1rem" }}>
              {v.summary}
            </span>
            <span className={styles.cardSub}>{v.date}</span>
          </div>
          <ul className={styles.changeList}>
            {v.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
