"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FolderTree,
  HardDrive,
  KeyRound,
  Lock,
  Mail,
  MailMinus,
  Menu,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  ThemeLangControls,
  useAppPreferences,
} from "@/components/app-preferences-provider";
import { Button } from "@/components/ui/button";
import type { AppLanguage } from "@/lib/i18n";

export interface LandingPageProps {
  onSignIn: () => Promise<void>;
  isCheckingSession?: boolean;
}

type Locale = AppLanguage;

interface StepItem {
  number: string;
  title: string;
  description: string;
}

interface FeatureItem {
  id: string;
  title: string;
  description: string;
  badge: string;
}

interface ComparisonRow {
  criterion: string;
  mailCleaner: string;
  typical: string;
}

interface PrivacyPillar {
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface LandingCopy {
  navAriaLabel: string;
  mobileMenuOpenLabel: string;
  mobileMenuCloseLabel: string;
  nav: {
    howItWorks: string;
    features: string;
    compare: string;
    privacy: string;
    faq: string;
  };
  cta: {
    tryFree: string;
    checkingSession: string;
    howItWorks: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    trustNote: string;
    previewLabel: string;
    previewHint: string;
    previewCaption: string;
    expandSubdomainPrefix: string;
    brandTag: string;
    brandCount: string;
    promoBadge: string;
    promoSummary: string;
    promoStats: string;
    promoActionClean: string;
    promoActionRestore: string;
    promoTrashedBadge: string;
    promoActionUnsub: string;
    promoActionUnsubscribed: string;
    safeBadge: string;
    safeSubBadge: string;
    safeUnprotectedBadge: string;
    safeSummary: string;
    safeUnprotectedSummary: string;
    safeStats: string;
    safeActionLocked: string;
    safeUnprotectedNote: string;
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: [StepItem, StepItem, StepItem];
  };
  features: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: [
      FeatureItem,
      FeatureItem,
      FeatureItem,
      FeatureItem,
      FeatureItem,
      FeatureItem,
    ];
  };
  compare: {
    eyebrow: string;
    title: string;
    subtitle: string;
    columnCriterion: string;
    columnMailCleaner: string;
    columnTypical: string;
    rows: [ComparisonRow, ComparisonRow, ComparisonRow, ComparisonRow];
  };
  earlyAccess: {
    badge: string;
    title: string;
    subtitle: string;
    includedTitle: string;
    includedItems: string[];
    phase2Note: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    subtitle: string;
    pillars: [PrivacyPillar, PrivacyPillar, PrivacyPillar, PrivacyPillar];
  };
  faq: {
    eyebrow: string;
    title: string;
    items: [FaqItem, FaqItem, FaqItem];
  };
  footer: {
    tagline: string;
    complianceNote: string;
  };
}

const COPY: Record<Locale, LandingCopy> = {
  en: {
    navAriaLabel: "Primary navigation",
    mobileMenuOpenLabel: "Open navigation menu",
    mobileMenuCloseLabel: "Close navigation menu",
    nav: {
      howItWorks: "How it works",
      features: "Features",
      compare: "Compare",
      privacy: "Privacy",
      faq: "FAQ",
    },
    cta: {
      tryFree: "Try free with Gmail",
      checkingSession: "Checking session...",
      howItWorks: "How it works",
    },
    hero: {
      eyebrow: "Google OAuth 2.0 · Gmail API Limited Use",
      title: "Clean 20,000+ emails without deleting a single receipt.",
      subtitle:
        "mailCleaner maps your Gmail into a Brand → Subdomain → Sender tree so you can wipe promotions, protect order notices with Keep safe, inspect emails in a sandbox, and unsubscribe in one click.",
      trustNote:
        "Read & clean only what you select. Zero data selling, zero AI training, and 1-click cache wipe.",
      previewLabel: "Interactive demo",
      previewHint: "Try Keep safe, Unsubscribe or Trash",
      previewCaption: "Brand → Subdomain → Sender",
      expandSubdomainPrefix: "Toggle",
      brandTag: "Brand",
      brandCount: "2 subdomains",
      promoBadge: "Ready to clean",
      promoSummary: "Promotional newsletters & seasonal blasts",
      promoStats: "342 emails · 48.2 MB",
      promoActionClean: "Trash",
      promoActionRestore: "Restore",
      promoTrashedBadge: "In Trash (demo)",
      promoActionUnsub: "Unsubscribe",
      promoActionUnsubscribed: "Unsubscribed (demo)",
      safeBadge: "Keep safe",
      safeSubBadge: "Protected",
      safeUnprotectedBadge: "Unprotected",
      safeSummary: "Order receipts & shipping alerts stay blocked from deletion",
      safeUnprotectedSummary:
        "Order receipts & shipping alerts could be selected for cleanup",
      safeStats: "18 emails · 2.4 MB",
      safeActionLocked: "Protected by Keep safe",
      safeUnprotectedNote: "Not protected",
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "Three focused steps from cluttered inbox to reclaimed space",
      subtitle:
        "Built around Gmail API quota pacing and local metadata caching so full-mailbox cleanup stays fast and predictable.",
      steps: [
        {
          number: "01",
          title: "Connect with Google OAuth (Limited Use)",
          description:
            "Sign in directly with Google OAuth 2.0 for Gmail. You stay in control and can revoke access and erase local metadata anytime.",
        },
        {
          number: "02",
          title: "Scan 20,000+ emails grouped by Brand & Subdomain",
          description:
            "Our quota-paced scanner caches lightweight metadata locally in SQLite and splits senders into a clear Brand → Subdomain → Sender hierarchy.",
        },
        {
          number: "03",
          title: "Protect receipts with Keep safe, unsubscribe & reclaim space",
          description:
            "Lock important senders with Keep safe, preview emails safely in a sandbox, unsubscribe in one click, and track Space Reclaimed.",
        },
      ],
    },
    features: {
      eyebrow: "Real capabilities",
      title: "Everything implemented in mailCleaner today",
      subtitle:
        "Every tool in the dashboard is engineered to clean aggressively where it is safe and stop immediately where it is not.",
      items: [
        {
          id: "tree",
          badge: "3-level hierarchy",
          title: "Brand → Subdomain Tree",
          description:
            "Groups messages by brand, exact subdomain, and individual sender so marketing subdomains can be cleared without touching transactional notices. Sort by size, count, or domains.",
        },
        {
          id: "keep-safe",
          badge: "Safety guard",
          title: "Keep safe Protection",
          description:
            "Whitelist an entire brand, a specific subdomain, or an exact sender address. Protected rules block accidental Trash or permanent deletion across manual and bulk actions.",
        },
        {
          id: "sandbox",
          badge: "Isolated viewer",
          title: "Safe Sandboxed Email Preview",
          description:
            "Inspect real message content on demand inside an isolated sandboxed viewer before deleting—without executing remote scripts or saving email bodies to disk.",
        },
        {
          id: "unsubscribe",
          badge: "1-click exit",
          title: "One-Click Unsubscribe",
          description:
            "Triggers standard one-click or email unsubscribe requests automatically, or surfaces a verified unsubscribe link with built-in URL safety checks.",
        },
        {
          id: "auto-clean",
          badge: "Native Gmail filters",
          title: "Auto-Clean & Gmail Block Filters",
          description:
            "Save recurring cleanup rules to run on demand and sync native Gmail block filters directly into your Gmail settings to stop repeat clutter.",
        },
        {
          id: "space",
          badge: "Attachment filters",
          title: "Space Reclaimed & Heavy Attachments",
          description:
            "Monitor Space Reclaimed bytes and cleaned message counts persistently, and filter directly by With Attachments or Heavy Attachments (> 5 MB).",
        },
      ],
    },
    compare: {
      eyebrow: "Honest comparison",
      title: "mailCleaner vs. Typical Inbox Cleaners",
      subtitle:
        "Designed for people who want granular control over subdomains, receipts, and privacy—not a black-box bulk deleter.",
      columnCriterion: "Capability",
      columnMailCleaner: "mailCleaner",
      columnTypical: "Typical Inbox Cleaners",
      rows: [
        {
          criterion: "Sender grouping",
          mailCleaner:
            "3-level Brand → Subdomain → Exact Sender tree separates promo mailers from receipt subdomains.",
          typical:
            "Flat sender list that forces you to inspect addresses one by one or risk wiping receipts.",
        },
        {
          criterion: "Receipt protection",
          mailCleaner:
            "Built-in Keep safe protection rules enforced at the clean-action guard level.",
          typical:
            "Manual checkboxes or basic exclusions with no brand/subdomain safety lock.",
        },
        {
          criterion: "Large mailbox scan",
          mailCleaner:
            "Full 20,000+ mailbox scan with SQLite metadata cache, Gmail Batch HTTP, and quota pacing.",
          typical:
            "Commonly capped around 10,000 emails or requires slow full re-scans each visit.",
        },
        {
          criterion: "Privacy & data exit",
          mailCleaner:
            "Google Limited Use compliance, zero data selling, zero AI training, plus 1-click cache wipe & OAuth revoke.",
          typical:
            "Often opaque data retention policies or ad-panel / market-research monetization.",
        },
      ],
    },
    earlyAccess: {
      badge: "Free Early Access",
      title: "Try the full Gmail cleaner right now—no paywall, no fake tiers.",
      subtitle:
        "Connect your Gmail account and test every implemented feature directly on your own inbox during Early Access.",
      includedTitle: "Included in Free Early Access",
      includedItems: [
        "Full 20,000+ email scan with local SQLite metadata cache",
        "Brand → Subdomain → Sender tree, sorting, and attachment filters",
        "Keep safe whitelist rules, sandboxed previews, and Trash / permanent delete controls",
        "One-click unsubscribe, Auto-Clean rules, and native Gmail block filters",
      ],
      phase2Note:
        "Transparent roadmap: A 30-day monthly pass with payment gateway integration is planned for Phase 2.",
    },
    privacy: {
      eyebrow: "Privacy & Trust",
      title: "Compliant with Google API Services User Data Policy (Limited Use)",
      subtitle:
        "Your inbox is yours. mailCleaner processes only what is required to organize, preview, unsubscribe, and clean the messages you choose.",
      pillars: [
        {
          title: "Zero data selling",
          description:
            "We never sell, rent, or share your Gmail metadata or email address with advertisers or data brokers.",
        },
        {
          title: "Zero AI training",
          description:
            "Your messages and metadata are never used to train AI or machine-learning models.",
        },
        {
          title: "Metadata-only local SQLite cache",
          description:
            "Only sender, subject, date, byte size, and unsubscribe availability are cached locally—never full email bodies.",
        },
        {
          title: "1-click wipe & OAuth disconnect",
          description:
            'Use "Delete my local cache & disconnect" anytime to erase local rules and metadata and revoke Google OAuth.',
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Straight answers before you connect",
      items: [
        {
          question:
            "How does mailCleaner avoid deleting important receipts or order notices?",
          answer:
            "Instead of flattening every address into one bucket, mailCleaner builds a Brand → Subdomain → Sender tree. You can mark a brand, a transactional subdomain (like notice.aliexpress.com), or an exact sender with Keep safe—blocking deletion in both individual and bulk cleanups. Deletions default to Trash (30-day recovery), while permanent delete requires explicit extra confirmation.",
        },
        {
          question:
            "What data is stored locally and can I delete everything if I stop using it?",
          answer:
            "To keep 20,000+ email scans responsive, mailCleaner caches only lightweight metadata (sender, subject, date, size, and unsubscribe header flags) in your local SQLite database—never raw email bodies or attachments. At any moment you can click 'Delete my local cache & disconnect' to erase all cached metadata, Keep safe rules, Auto-Clean rules, sessions, and revoke your Google OAuth token.",
        },
        {
          question: "How much does it cost and which email providers work today?",
          answer:
            "Right now mailCleaner is in Free Early Access—there are no paywalls or subscription charges during this stage. A 30-day monthly pass is planned for Phase 2 once billing is integrated. Currently, mailCleaner supports Gmail via Google OAuth 2.0; additional providers are planned after the Gmail MVP.",
        },
      ],
    },
    footer: {
      tagline:
        "Precision Gmail cleanup with Brand → Subdomain grouping, Keep safe rules, and Google Limited Use privacy.",
      complianceNote:
        "Built for Gmail via Google OAuth 2.0 · Google API Services User Data Policy (Limited Use).",
    },
  },
  es: {
    navAriaLabel: "Navegación principal",
    mobileMenuOpenLabel: "Abrir menú de navegación",
    mobileMenuCloseLabel: "Cerrar menú de navegación",
    nav: {
      howItWorks: "Cómo funciona",
      features: "Funciones",
      compare: "Comparativa",
      privacy: "Privacidad",
      faq: "Preguntas",
    },
    cta: {
      tryFree: "Pruébalo gratis con Gmail",
      checkingSession: "Verificando sesión...",
      howItWorks: "Cómo funciona",
    },
    hero: {
      eyebrow: "Google OAuth 2.0 · Gmail API Limited Use",
      title: "Limpia más de 20,000 correos sin borrar un solo recibo.",
      subtitle:
        "mailCleaner organiza tu Gmail en un árbol Marca → Subdominio → Remitente para eliminar promociones, proteger avisos de compra con Keep safe, previsualizar mensajes en sandbox y desuscribirte en 1 clic.",
      trustNote:
        "Lee y limpia solo lo que seleccionas. Cero venta de datos, cero entrenamiento de IA y borrado de caché en 1 clic.",
      previewLabel: "Demo interactivo",
      previewHint: "Prueba Keep safe, Desuscribir o Papelera",
      previewCaption: "Marca → Subdominio → Remitente",
      expandSubdomainPrefix: "Alternar",
      brandTag: "Marca",
      brandCount: "2 subdominios",
      promoBadge: "Listo para limpiar",
      promoSummary: "Boletines promocionales y campañas de ofertas",
      promoStats: "342 correos · 48.2 MB",
      promoActionClean: "Papelera",
      promoActionRestore: "Restaurar",
      promoTrashedBadge: "En Papelera (demo)",
      promoActionUnsub: "Desuscribir",
      promoActionUnsubscribed: "Desuscrito (demo)",
      safeBadge: "Keep safe",
      safeSubBadge: "Protegido",
      safeUnprotectedBadge: "Sin protección",
      safeSummary: "Recibos y avisos de envío bloqueados contra borrado",
      safeUnprotectedSummary:
        "Recibos y avisos de envío quedarían expuestos a limpieza",
      safeStats: "18 correos · 2.4 MB",
      safeActionLocked: "Protegido con Keep safe",
      safeUnprotectedNote: "Sin protección",
    },
    howItWorks: {
      eyebrow: "Cómo funciona",
      title: "Tres pasos claros de bandeja saturada a espacio recuperado",
      subtitle:
        "Diseñado con control de cuota de Gmail API y caché local de metadatos para que escanear todo tu buzón sea rápido y estable.",
      steps: [
        {
          number: "01",
          title: "Conecta con Google OAuth (Limited Use)",
          description:
            "Inicia sesión directamente con Google OAuth 2.0 para Gmail. Mantienes el control total y puedes revocar el acceso cuando quieras.",
        },
        {
          number: "02",
          title: "Escanea 20,000+ correos agrupados por Marca y Subdominio",
          description:
            "El escáner con control de cuota guarda metadatos ligeros en SQLite y separa los envíos en un árbol Marca → Subdominio → Remitente.",
        },
        {
          number: "03",
          title: "Protege recibos con Keep safe, desuscríbete y recupera espacio",
          description:
            "Bloquea remitentes clave con Keep safe, revisa correos en sandbox antes de actuar, desuscríbete en 1 clic y mide el Espacio recuperado.",
        },
      ],
    },
    features: {
      eyebrow: "Funciones reales",
      title: "Todo lo que ya está implementado en mailCleaner",
      subtitle:
        "Cada herramienta del panel está pensada para limpiar a fondo lo innecesario y frenar en seco ante cualquier mensaje importante.",
      items: [
        {
          id: "tree",
          badge: "Árbol de 3 niveles",
          title: "Árbol Marca → Subdominio",
          description:
            "Agrupa por marca, subdominio y remitente exacto para limpiar subdominios de marketing sin tocar avisos transaccionales. Ordenable por tamaño, cantidad o dominios.",
        },
        {
          id: "keep-safe",
          badge: "Protección activa",
          title: "Protección Keep safe",
          description:
            "Protege marcas completas, subdominios específicos o remitentes exactos. Las reglas Keep safe impiden enviar a Papelera o borrar por accidente incluso en lotes.",
        },
        {
          id: "sandbox",
          badge: "Visor aislado",
          title: "Vista previa segura en Sandbox",
          description:
            "Inspecciona el contenido real bajo demanda dentro de un visor aislado antes de borrar—sin ejecutar scripts remotos ni guardar cuerpos de correo en disco.",
        },
        {
          id: "unsubscribe",
          badge: "Salida en 1 clic",
          title: "Desuscripción en 1 clic",
          description:
            "Envía solicitudes estándar de desuscripción en 1 clic o por correo automáticamente, o muestra un enlace verificado con validación de seguridad de URL.",
        },
        {
          id: "auto-clean",
          badge: "Filtros en Gmail",
          title: "Auto-Clean y filtros de bloqueo en Gmail",
          description:
            "Guarda reglas Auto-Clean para ejecutarlas cuando quieras y sincroniza filtros nativos de bloqueo directamente en la configuración de tu Gmail.",
        },
        {
          id: "space",
          badge: "Filtro de adjuntos",
          title: "Espacio recuperado y adjuntos pesados",
          description:
            "Lleva el conteo persistente de espacio recuperado y correos limpiados, y filtra al instante por Con adjuntos o Adjuntos pesados (> 5 MB).",
        },
      ],
    },
    compare: {
      eyebrow: "Comparativa honesta",
      title: "mailCleaner vs. Limpiadores típicos de correo",
      subtitle:
        "Hecho para quienes quieren control fino sobre subdominios, recibos y privacidad—no un borrador masivo a ciegas.",
      columnCriterion: "Capacidad",
      columnMailCleaner: "mailCleaner",
      columnTypical: "Limpiadores típicos",
      rows: [
        {
          criterion: "Agrupación de remitentes",
          mailCleaner:
            "Árbol de 3 niveles Marca → Subdominio → Remitente exacto que separa promos de recibos.",
          typical:
            "Lista plana que mezcla correos comerciales y transaccionales o exige revisar uno por uno.",
        },
        {
          criterion: "Protección de recibos",
          mailCleaner:
            "Reglas Keep safe integradas y validadas directamente antes de ejecutar cualquier limpieza.",
          typical:
            "Selección manual o exclusiones básicas sin bloqueo por marca o subdominio.",
        },
        {
          criterion: "Escaneo de buzones grandes",
          mailCleaner:
            "Escaneo completo de 20,000+ correos con caché SQLite local, Gmail Batch HTTP y control de cuota.",
          typical:
            "Suelen limitar alrededor de 10,000 correos o reescanear lento en cada sesión.",
        },
        {
          criterion: "Privacidad y salida",
          mailCleaner:
            "Cumplimiento Google Limited Use, cero venta de datos, cero entrenamiento de IA y borrado de caché + revocación en 1 clic.",
          typical:
            "Políticas de retención poco claras o modelos basados en monetización de datos.",
        },
      ],
    },
    earlyAccess: {
      badge: "Acceso Anticipado gratuito",
      title: "Prueba el limpiador completo hoy—sin bloqueos ni precios inventados.",
      subtitle:
        "Conecta tu cuenta de Gmail y prueba todas las funciones reales directamente en tu bandeja durante el Acceso Anticipado.",
      includedTitle: "Incluido en el Acceso Anticipado",
      includedItems: [
        "Escaneo completo de 20,000+ correos con caché local de metadatos SQLite",
        "Árbol Marca → Subdominio → Remitente, ordenamiento y filtros por adjuntos",
        "Reglas Keep safe, vista previa en sandbox y control de Papelera / borrado permanente",
        "Desuscripción en 1 clic, reglas Auto-Clean y filtros de bloqueo en Gmail",
      ],
      phase2Note:
        "Hoja de ruta transparente: El pase mensual de 30 días llegará en Fase 2 cuando se integre la pasarela de pago.",
    },
    privacy: {
      eyebrow: "Privacidad y confianza",
      title:
        "Cumplimiento con Google API Services User Data Policy (Limited Use)",
      subtitle:
        "Tu bandeja sigue siendo tuya. mailCleaner procesa únicamente lo necesario para agrupar, previsualizar, desuscribir y limpiar los correos que tú elijas.",
      pillars: [
        {
          title: "Cero venta de datos",
          description:
            "Nunca vendemos, alquilamos ni compartimos tus metadatos de Gmail o dirección con anunciantes ni terceros.",
        },
        {
          title: "Cero entrenamiento de IA",
          description:
            "Tus correos y metadatos jamás se utilizan para entrenar modelos de inteligencia artificial o machine learning.",
        },
        {
          title: "Caché local SQLite solo de metadatos",
          description:
            "Solo se guardan remitente, asunto, fecha, tamaño y disponibilidad de desuscripción—nunca el cuerpo completo del correo.",
        },
        {
          title: "Borrado y desconexión en 1 clic",
          description:
            'Usa "Eliminar mi caché local y desconectar" en cualquier momento para borrar tu caché local, reglas y revocar Google OAuth.',
        },
      ],
    },
    faq: {
      eyebrow: "Preguntas frecuentes",
      title: "Respuestas claras antes de conectar tu cuenta",
      items: [
        {
          question:
            "¿Cómo evita mailCleaner borrar recibos o avisos importantes?",
          answer:
            "En lugar de mezclar todo en una lista plana, mailCleaner construye un árbol Marca → Subdominio → Remitente. Puedes proteger una marca, un subdominio transaccional (como notice.aliexpress.com) o un remitente exacto con Keep safe, bloqueando el borrado tanto individual como en lote. Además, la limpieza va por defecto a Papelera (recuperable 30 días) y el borrado permanente exige confirmación extra explícita.",
        },
        {
          question:
            "¿Qué datos guarda en local y cómo puedo eliminarlos por completo?",
          answer:
            "Para que el escaneo de 20,000+ correos sea ágil, mailCleaner guarda únicamente metadatos ligeros (remitente, asunto, fecha, tamaño y estado de cabecera de desuscripción) en tu base SQLite local—nunca cuerpos completos ni adjuntos. Cuando quieras puedes usar 'Eliminar mi caché local y desconectar' para borrar toda la caché, reglas Keep safe, reglas Auto-Clean, sesiones y revocar el token OAuth en Google.",
        },
        {
          question: "¿Cuánto cuesta y qué proveedores de correo soporta?",
          answer:
            "Actualmente mailCleaner está en Acceso Anticipado gratuito: puedes probarlo en tu bandeja sin muros de pago ni precios inventados. El pase mensual de 30 días llegará en Fase 2 junto con la pasarela de pagos. Por ahora soporta Gmail mediante Google OAuth 2.0.",
        },
      ],
    },
    footer: {
      tagline:
        "Limpieza precisa de Gmail con árbol Marca → Subdominio, protección Keep safe y privacidad Limited Use.",
      complianceNote:
        "Diseñado para Gmail con Google OAuth 2.0 · Google API Services User Data Policy (Limited Use).",
    },
  },
};

const FEATURE_ICONS = [
  FolderTree,
  ShieldCheck,
  Eye,
  MailMinus,
  Ban,
  HardDrive,
] as const;

const PRIVACY_ICONS = [Shield, Lock, Database, KeyRound] as const;

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion) {
      const frameId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return { ref, isVisible };
}

function ScrollRevealContainer({
  children,
  className = "",
}: {
  children: (isVisible: boolean) => ReactNode;
  className?: string;
}) {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div ref={ref} className={className}>
      {children(isVisible)}
    </div>
  );
}

function SignInCtaButton({
  onSignIn,
  isCheckingSession,
  label,
  checkingLabel,
  size = "lg",
  className = "",
}: {
  onSignIn: () => Promise<void>;
  isCheckingSession: boolean;
  label: string;
  checkingLabel: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  if (isCheckingSession) {
    return (
      <Button
        type="button"
        disabled
        size={size}
        variant="outline"
        className={`mc-btn-press border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${className}`.trim()}
      >
        {checkingLabel}
      </Button>
    );
  }

  return (
    <form action={onSignIn}>
      <Button
        type="submit"
        size={size}
        className={`mc-btn-press cursor-pointer bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 hover:shadow-emerald-500/25 focus-visible:ring-emerald-500/50 dark:bg-emerald-400 dark:text-zinc-950 dark:shadow-emerald-500/20 dark:hover:bg-emerald-300 dark:focus-visible:ring-emerald-400/50 ${className}`.trim()}
      >
        <Mail className="size-4" />
        <span>{label}</span>
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

function BrandTreePreviewCard({ copy }: { copy: LandingCopy["hero"] }) {
  const [isPromoExpanded, setIsPromoExpanded] = useState(true);
  const [isNoticeExpanded, setIsNoticeExpanded] = useState(true);
  const [isNoticeProtected, setIsNoticeProtected] = useState(true);
  const [isDealsTrashed, setIsDealsTrashed] = useState(false);
  const [isDealsUnsubscribed, setIsDealsUnsubscribed] = useState(false);

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-3 -z-10 rounded-3xl blur-2xl transition-opacity duration-500 ${
          isNoticeProtected
            ? "bg-emerald-500/18 opacity-100 dark:bg-emerald-500/22"
            : "bg-amber-500/10 opacity-75 dark:bg-amber-500/12"
        }`}
      />
      <div
        className={`relative rounded-2xl border bg-white p-3 transition-all duration-300 sm:p-5 dark:bg-zinc-900/95 ${
          isNoticeProtected
            ? "border-emerald-500/35 shadow-xl shadow-emerald-950/10 ring-1 ring-emerald-500/15 dark:border-emerald-500/30 dark:shadow-2xl dark:shadow-black/70 dark:ring-emerald-400/15"
            : "border-zinc-200 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:shadow-2xl dark:shadow-black/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3.5 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              </span>
              {copy.previewLabel}
            </span>
            <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
              {copy.previewHint}
            </span>
          </div>
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {copy.previewCaption}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {/* Level 1: Brand */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 sm:p-4 dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ChevronDown className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200">
                  AX
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Aliexpress
                  </p>
                  <p className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                    aliexpress.com · {copy.brandCount}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                {copy.brandTag}
              </span>
            </div>

            <div className="mt-3.5 space-y-2.5 border-l border-zinc-300 pl-2.5 sm:pl-4 dark:border-zinc-800">
              {/* Level 2: Promotional Subdomain */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-50/80 p-2.5 transition-colors sm:p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={isPromoExpanded}
                    aria-controls="demo-promo-sender"
                    aria-label={`${copy.expandSubdomainPrefix} mail.aliexpress.com`}
                    onClick={() => setIsPromoExpanded((prev) => !prev)}
                    className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:min-h-[28px]"
                  >
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-amber-700 transition-transform duration-200 dark:text-amber-300 ${
                        isPromoExpanded ? "" : "-rotate-90"
                      }`}
                    />
                    <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      mail.aliexpress.com
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-600 tabular-nums dark:text-zinc-400">
                      {copy.promoStats}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        isDealsTrashed
                          ? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-200"
                          : "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      }`}
                    >
                      {isDealsTrashed ? copy.promoTrashedBadge : copy.promoBadge}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {copy.promoSummary}
                </p>

                <div
                  id="demo-promo-sender"
                  className="mc-accordion"
                  data-open={isPromoExpanded ? "true" : "false"}
                >
                  <div className="mc-accordion-inner">
                    {/* Level 3: Exact Sender */}
                    <div
                      className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors sm:px-3 ${
                        isDealsTrashed
                          ? "border-rose-500/30 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-950/30"
                          : "border-zinc-200 bg-white dark:border-zinc-800/90 dark:bg-zinc-950/90"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight className="size-3 shrink-0 text-zinc-400 dark:text-zinc-500" />
                        <span
                          className={`truncate font-mono text-[11px] ${
                            isDealsTrashed
                              ? "text-zinc-500 line-through dark:text-zinc-400"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          deals@mail.aliexpress.com
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-pressed={isDealsUnsubscribed}
                          onClick={() =>
                            setIsDealsUnsubscribed((prev) => !prev)
                          }
                          className={`mc-btn-press inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:min-h-[28px] ${
                            isDealsUnsubscribed
                              ? "border-sky-600/40 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25 dark:border-sky-400/45 dark:bg-sky-500/15 dark:text-sky-200"
                              : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {isDealsUnsubscribed ? (
                            <>
                              <Check className="size-3 text-sky-600 dark:text-sky-400" />
                              {copy.promoActionUnsubscribed}
                            </>
                          ) : (
                            <>
                              <MailMinus className="size-3 text-sky-600 dark:text-sky-400" />
                              {copy.promoActionUnsub}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-pressed={isDealsTrashed}
                          onClick={() => setIsDealsTrashed((prev) => !prev)}
                          className={`mc-btn-press inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:min-h-[28px] ${
                            isDealsTrashed
                              ? "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:border-emerald-400/40 dark:text-emerald-200"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25"
                          }`}
                        >
                          {isDealsTrashed ? (
                            <>
                              <RotateCcw className="size-3" />
                              {copy.promoActionRestore}
                            </>
                          ) : (
                            <>
                              <Trash2 className="size-3" />
                              {copy.promoActionClean}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Level 2: Transactional Subdomain Protected by Keep safe */}
              <div
                className={`rounded-xl border p-2.5 transition-all duration-300 sm:p-3 ${
                  isNoticeProtected
                    ? "border-emerald-500/45 bg-emerald-50/85 shadow-sm shadow-emerald-500/10 ring-1 ring-emerald-500/20 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:ring-emerald-400/20"
                    : "border-amber-500/40 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={isNoticeExpanded}
                    aria-controls="demo-notice-sender"
                    aria-label={`${copy.expandSubdomainPrefix} notice.aliexpress.com`}
                    onClick={() => setIsNoticeExpanded((prev) => !prev)}
                    className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:min-h-[28px]"
                  >
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform duration-200 ${
                        isNoticeExpanded ? "" : "-rotate-90"
                      } ${
                        isNoticeProtected
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                    />
                    <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      notice.aliexpress.com
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-600 tabular-nums dark:text-zinc-400">
                      {copy.safeStats}
                    </span>
                    <button
                      type="button"
                      aria-pressed={isNoticeProtected}
                      onClick={() => setIsNoticeProtected((prev) => !prev)}
                      className={`mc-btn-press inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:min-h-[28px] ${
                        isNoticeProtected
                          ? "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 shadow-xs shadow-emerald-500/15 hover:bg-emerald-500/25 dark:border-emerald-400/45 dark:bg-emerald-400/15 dark:text-emerald-300"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <ShieldCheck className="size-3" />
                      {isNoticeProtected
                        ? `${copy.safeBadge} · ${copy.safeSubBadge}`
                        : `${copy.safeBadge}: ${copy.safeUnprotectedBadge}`}
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                  {isNoticeProtected
                    ? copy.safeSummary
                    : copy.safeUnprotectedSummary}
                </p>

                <div
                  id="demo-notice-sender"
                  className="mc-accordion"
                  data-open={isNoticeExpanded ? "true" : "false"}
                >
                  <div className="mc-accordion-inner">
                    {/* Level 3: Exact Sender */}
                    <div
                      className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors sm:px-3 ${
                        isNoticeProtected
                          ? "border-emerald-500/30 bg-white dark:border-emerald-500/25 dark:bg-zinc-950/90"
                          : "border-amber-500/30 bg-white dark:border-amber-500/25 dark:bg-zinc-950/90"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight
                          className={`size-3 shrink-0 ${
                            isNoticeProtected
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        />
                        <span className="truncate font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                          orders@notice.aliexpress.com
                        </span>
                      </div>
                      {isNoticeProtected ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
                          <Lock className="size-3" />
                          {copy.safeActionLocked}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                          {copy.safeUnprotectedNote}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({
  onSignIn,
  isCheckingSession = false,
}: LandingPageProps) {
  const { lang } = useAppPreferences();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const copy = COPY[lang];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 selection:bg-emerald-500/25 selection:text-emerald-950 dark:bg-zinc-950 dark:text-zinc-50 dark:selection:bg-emerald-400/30 dark:selection:text-emerald-100">
      {/* Sticky Adaptive Navbar */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <a
            href="#"
            className="flex shrink-0 items-center gap-2.5 text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Mail className="size-4" />
            </span>
            <span>mailCleaner</span>
          </a>

          <nav
            aria-label={copy.navAriaLabel}
            className="hidden items-center gap-6 text-sm text-zinc-600 lg:flex dark:text-zinc-300"
          >
            <a
              href="#how-it-works"
              className="inline-flex min-h-[28px] items-center whitespace-nowrap transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {copy.nav.howItWorks}
            </a>
            <a
              href="#features"
              className="inline-flex min-h-[28px] items-center whitespace-nowrap transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {copy.nav.features}
            </a>
            <a
              href="#compare"
              className="inline-flex min-h-[28px] items-center whitespace-nowrap transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {copy.nav.compare}
            </a>
            <a
              href="#privacy"
              className="inline-flex min-h-[28px] items-center whitespace-nowrap transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {copy.nav.privacy}
            </a>
            <a
              href="#faq"
              className="inline-flex min-h-[28px] items-center whitespace-nowrap transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {copy.nav.faq}
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeLangControls />

            <SignInCtaButton
              onSignIn={onSignIn}
              isCheckingSession={isCheckingSession}
              label={copy.cta.tryFree}
              checkingLabel={copy.cta.checkingSession}
              size="sm"
              className="hidden sm:inline-flex"
            />

            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-menu"
              aria-label={
                isMobileMenuOpen
                  ? copy.mobileMenuCloseLabel
                  : copy.mobileMenuOpenLabel
              }
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 lg:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              {isMobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
          </div>
        </div>

        {isMobileMenuOpen ? (
          <nav
            id="mobile-nav-menu"
            aria-label={copy.navAriaLabel}
            className="border-t border-zinc-200/80 bg-white/95 px-4 py-3 lg:hidden dark:border-zinc-800/80 dark:bg-zinc-950/95"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-1">
              <a
                href="#how-it-works"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {copy.nav.howItWorks}
              </a>
              <a
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {copy.nav.features}
              </a>
              <a
                href="#compare"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {copy.nav.compare}
              </a>
              <a
                href="#privacy"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {copy.nav.privacy}
              </a>
              <a
                href="#faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {copy.nav.faq}
              </a>
              <div className="pt-2">
                <SignInCtaButton
                  onSignIn={onSignIn}
                  isCheckingSession={isCheckingSession}
                  label={copy.cta.tryFree}
                  checkingLabel={copy.cta.checkingSession}
                  size="default"
                  className="w-full justify-center"
                />
              </div>
            </div>
          </nav>
        ) : null}
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative isolate overflow-hidden border-b border-zinc-200 dark:border-zinc-900">
          <div
            aria-hidden="true"
            className="mc-surface-grid pointer-events-none absolute inset-0 -z-10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.16),transparent_68%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.20),transparent_68%)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24">
            <div className="space-y-6 lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
                <ShieldCheck className="size-3.5" />
                <span>{copy.hero.eyebrow}</span>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl lg:leading-[1.08] dark:text-zinc-50">
                {copy.hero.title}
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-300">
                {copy.hero.subtitle}
              </p>

              <div
                className="mc-fade-up flex flex-wrap items-center gap-3 pt-1"
                style={{ animationDelay: "90ms" }}
              >
                <SignInCtaButton
                  onSignIn={onSignIn}
                  isCheckingSession={isCheckingSession}
                  label={copy.cta.tryFree}
                  checkingLabel={copy.cta.checkingSession}
                />
                <a
                  href="#how-it-works"
                  className="mc-btn-press inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  {copy.cta.howItWorks}
                </a>
              </div>

              <p
                className="mc-fade-up flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400"
                style={{ animationDelay: "160ms" }}
              >
                <Lock className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{copy.hero.trustNote}</span>
              </p>
            </div>

            <div
              className="mc-fade-up lg:col-span-6"
              style={{ animationDelay: "120ms" }}
            >
              <BrandTreePreviewCard copy={copy.hero} />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section
          id="how-it-works"
          className="border-b border-zinc-200 bg-white py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-950"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {copy.howItWorks.eyebrow}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                {copy.howItWorks.title}
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
                {copy.howItWorks.subtitle}
              </p>
            </div>

            <ScrollRevealContainer className="mt-10 grid gap-5 md:grid-cols-3">
              {(isVisible) =>
                copy.howItWorks.steps.map((step, index) => (
                  <div
                    key={step.number}
                    className="mc-reveal h-full"
                    data-visible={isVisible ? "true" : "false"}
                    style={{ "--mc-delay": `${index * 80}ms` } as CSSProperties}
                  >
                    <article className="mc-card-hover flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-6 hover:border-emerald-500/35 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/35">
                      <div>
                        <span className="inline-flex rounded-md border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
                          {step.number}
                        </span>
                        <h3 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                          {step.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {step.description}
                        </p>
                      </div>
                    </article>
                  </div>
                ))
              }
            </ScrollRevealContainer>
          </div>
        </section>

        {/* Features Grid (6 Cards) */}
        <section
          id="features"
          className="border-b border-zinc-200 bg-zinc-100/60 py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-900/25"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {copy.features.eyebrow}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                {copy.features.title}
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
                {copy.features.subtitle}
              </p>
            </div>

            <ScrollRevealContainer className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(isVisible) =>
                copy.features.items.map((feature, index) => {
                  const Icon = FEATURE_ICONS[index];
                  return (
                    <div
                      key={feature.id}
                      className="mc-reveal h-full"
                      data-visible={isVisible ? "true" : "false"}
                      style={{ "--mc-delay": `${index * 65}ms` } as CSSProperties}
                    >
                      <article className="mc-card-hover flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-6 hover:border-emerald-500/35 dark:border-zinc-800 dark:bg-zinc-950/90 dark:hover:border-emerald-500/35">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex size-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-emerald-300">
                            <Icon className="size-5" />
                          </span>
                          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                            {feature.badge}
                          </span>
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          {feature.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {feature.description}
                        </p>
                      </article>
                    </div>
                  );
                })
              }
            </ScrollRevealContainer>
          </div>
        </section>

        {/* Honest Comparison Table */}
        <section
          id="compare"
          className="border-b border-zinc-200 bg-white py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-950"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {copy.compare.eyebrow}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                {copy.compare.title}
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
                {copy.compare.subtitle}
              </p>
            </div>

            <ScrollRevealContainer className="mt-10">
              {(isVisible) => (
                <div
                  className="mc-reveal"
                  data-visible={isVisible ? "true" : "false"}
                >
                  {/* Mobile stacked cards (< md) */}
                  <div className="space-y-4 md:hidden">
                    {copy.compare.rows.map((row) => (
                      <article
                        key={row.criterion}
                        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
                      >
                        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {row.criterion}
                        </h3>
                        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3 dark:border-emerald-500/25 dark:bg-emerald-500/[0.06]">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {copy.compare.columnMailCleaner}
                          </p>
                          <div className="mt-1 flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{row.mailCleaner}</span>
                          </div>
                        </div>
                        <div className="mt-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            {copy.compare.columnTypical}
                          </p>
                          <div className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <X className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                            <span>{row.typical}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  {/* Desktop/tablet table (md+) */}
                  <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/90">
                            <th className="px-5 py-4 font-semibold text-zinc-700 dark:text-zinc-300">
                              {copy.compare.columnCriterion}
                            </th>
                            <th className="px-5 py-4 font-semibold text-emerald-700 dark:text-emerald-300">
                              {copy.compare.columnMailCleaner}
                            </th>
                            <th className="px-5 py-4 font-semibold text-zinc-600 dark:text-zinc-400">
                              {copy.compare.columnTypical}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                          {copy.compare.rows.map((row) => (
                            <tr
                              key={row.criterion}
                              className="align-top transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                            >
                              <td className="px-5 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                                {row.criterion}
                              </td>
                              <td className="bg-emerald-500/[0.04] px-5 py-4 text-zinc-800 dark:bg-emerald-500/[0.03] dark:text-zinc-200">
                                <div className="flex items-start gap-2.5">
                                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                  <span>{row.mailCleaner}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                                <div className="flex items-start gap-2.5">
                                  <X className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                                  <span>{row.typical}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </ScrollRevealContainer>
          </div>
        </section>

        {/* Transparent Free Early Access */}
        <section className="border-b border-zinc-200 bg-zinc-100/60 py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-900/25">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <ScrollRevealContainer>
              {(isVisible) => (
                <div
                  className="mc-reveal"
                  data-visible={isVisible ? "true" : "false"}
                >
                  <div className="mc-card-hover rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 via-white to-zinc-50 p-7 shadow-sm sm:p-10 dark:border-emerald-500/35 dark:from-emerald-500/10 dark:via-zinc-900/90 dark:to-zinc-950">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/35 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300">
                        <Sparkles className="size-3.5" />
                        {copy.earlyAccess.badge}
                      </span>
                      <SignInCtaButton
                        onSignIn={onSignIn}
                        isCheckingSession={isCheckingSession}
                        label={copy.cta.tryFree}
                        checkingLabel={copy.cta.checkingSession}
                      />
                    </div>

                    <h2 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                      {copy.earlyAccess.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700 sm:text-base dark:text-zinc-300">
                      {copy.earlyAccess.subtitle}
                    </p>

                    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        {copy.earlyAccess.includedTitle}
                      </p>
                      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        {copy.earlyAccess.includedItems.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2.5 text-sm text-zinc-800 dark:text-zinc-200"
                          >
                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="mt-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {copy.earlyAccess.phase2Note}
                    </p>
                  </div>
                </div>
              )}
            </ScrollRevealContainer>
          </div>
        </section>

        {/* Privacy & Trust */}
        <section
          id="privacy"
          className="border-b border-zinc-200 bg-white py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-950"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {copy.privacy.eyebrow}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                {copy.privacy.title}
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
                {copy.privacy.subtitle}
              </p>
            </div>

            <ScrollRevealContainer className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(isVisible) =>
                copy.privacy.pillars.map((pillar, index) => {
                  const Icon = PRIVACY_ICONS[index];
                  return (
                    <div
                      key={pillar.title}
                      className="mc-reveal h-full"
                      data-visible={isVisible ? "true" : "false"}
                      style={{ "--mc-delay": `${index * 70}ms` } as CSSProperties}
                    >
                      <article className="mc-card-hover h-full rounded-2xl border border-zinc-200 bg-zinc-50 p-5 hover:border-emerald-500/35 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/35">
                        <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
                          <Icon className="size-4" />
                        </div>
                        <h3 className="mt-3.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {pillar.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {pillar.description}
                        </p>
                      </article>
                    </div>
                  );
                })
              }
            </ScrollRevealContainer>
          </div>
        </section>

        {/* FAQ (3 items) */}
        <section
          id="faq"
          className="border-b border-zinc-200 bg-zinc-100/60 py-16 sm:py-20 dark:border-zinc-900 dark:bg-zinc-900/25"
        >
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {copy.faq.eyebrow}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                {copy.faq.title}
              </h2>
            </div>

            <ScrollRevealContainer className="mt-8 space-y-3">
              {(isVisible) =>
                copy.faq.items.map((item, index) => {
                  const isOpen = openFaqIndex === index;
                  const answerId = `faq-answer-${index}`;
                  return (
                    <div
                      key={item.question}
                      className="mc-reveal"
                      data-visible={isVisible ? "true" : "false"}
                      style={{ "--mc-delay": `${index * 75}ms` } as CSSProperties}
                    >
                      <div className="mc-card-hover rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/90 dark:hover:border-zinc-700">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={answerId}
                          onClick={() =>
                            setOpenFaqIndex((current) =>
                              current === index ? null : index,
                            )
                          }
                          className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                        >
                          <span className="text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-100">
                            {item.question}
                          </span>
                          <ChevronDown
                            className={`size-4 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-zinc-400 ${
                              isOpen
                                ? "rotate-180 text-emerald-700 dark:text-emerald-300"
                                : ""
                            }`}
                          />
                        </button>
                        <div
                          id={answerId}
                          className="mc-accordion"
                          data-open={isOpen ? "true" : "false"}
                        >
                          <div className="mc-accordion-inner">
                            <div className="border-t border-zinc-200 px-5 py-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-400">
                              {item.answer}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </ScrollRevealContainer>
          </div>
        </section>
      </main>

      {/* Footer with Final CTA */}
      <footer className="bg-white py-12 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center">
          <div className="max-w-lg space-y-2">
            <div className="flex items-center gap-2 text-base font-bold text-zinc-950 dark:text-zinc-50">
              <span className="flex size-7 items-center justify-center rounded-md border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Mail className="size-3.5" />
              </span>
              <span>mailCleaner</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {copy.footer.tagline}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {copy.footer.complianceNote}
            </p>
          </div>

          <SignInCtaButton
            onSignIn={onSignIn}
            isCheckingSession={isCheckingSession}
            label={copy.cta.tryFree}
            checkingLabel={copy.cta.checkingSession}
          />
        </div>
      </footer>
    </div>
  );
}
