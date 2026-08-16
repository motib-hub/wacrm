import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidad — Motib',
  description:
    'Cómo Motib trata los datos personales de quienes nos escriben por WhatsApp o a través de la web.',
}

/**
 * Public privacy policy.
 *
 * Meta requires a reachable privacy policy URL before an app can be
 * switched to Live mode, and an app that isn't Live receives no
 * production webhooks at all — so without this page no WhatsApp
 * message ever reaches the inbox.
 *
 * It lives here rather than on the marketing site because the policy
 * Meta asks for is the *app's*, and this app is the CRM: it's the
 * thing that actually stores the conversations being described.
 *
 * Public by default — `/privacy` is absent from the `protectedPaths`
 * allowlist in src/middleware.ts. Keep it that way; Meta's crawler
 * signs in to nothing.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">
        Política de Privacidad
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: 16 de agosto de 2026
      </p>

      <div className="mt-10 space-y-10 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1">
        <section>
          <h2>1. Quién es el responsable de tus datos</h2>
          <p>
            <strong>Responsable:</strong> Motib
            <br />
            <strong>Sitio web:</strong>{' '}
            <a
              className="underline underline-offset-4"
              href="https://www.motibhub.com.ar"
            >
              www.motibhub.com.ar
            </a>
            <br />
            <strong>Correo de contacto:</strong>{' '}
            <a
              className="underline underline-offset-4"
              href="mailto:motibhub@gmail.com"
            >
              motibhub@gmail.com
            </a>
          </p>
          <p>
            Motib es una consultora de marketing. Este documento explica qué
            datos personales tratamos, para qué, con qué base legal y qué podés
            hacer al respecto.
          </p>
          <p>
            <strong>Normativa aplicable.</strong> Operamos desde España y buena
            parte de nuestros clientes están en Argentina, así que tratamos tus
            datos conforme al Reglamento General de Protección de Datos (UE)
            2016/679 y la LOPDGDD española, y conforme a la Ley 25.326 de
            Protección de los Datos Personales de Argentina cuando residís allí.
            Cuando ambas normas difieren, aplicamos la más protectora para vos.
          </p>
        </section>

        <section>
          <h2>2. Qué datos tratamos y de dónde salen</h2>
          <p>
            <strong>Si nos escribís por WhatsApp:</strong> tu número de
            teléfono, el nombre que tengas configurado en tu perfil de WhatsApp
            y el contenido de los mensajes que nos envíes (texto, imágenes,
            audios, documentos). Los recibimos a través de la Plataforma de
            WhatsApp Business de Meta.
          </p>
          <p>
            <strong>Si completás un formulario en la web:</strong> los datos que
            nos des voluntariamente — nombre, correo electrónico, teléfono,
            empresa y el mensaje que escribas.
          </p>
          <p>
            <strong>Si sos cliente:</strong> además de lo anterior, los datos de
            contacto y facturación necesarios para prestarte el servicio.
          </p>
          <p>No compramos bases de datos ni obtenemos tus datos de terceros.</p>
        </section>

        <section>
          <h2>3. Para qué los usamos y con qué base legal</h2>
          <ul>
            <li>
              <strong>Responder tus consultas y mantener la conversación</strong>{' '}
              — ejecución de un contrato o medidas precontractuales a tu
              petición.
            </li>
            <li>
              <strong>Prestarte el servicio contratado y facturarlo</strong> —
              ejecución de un contrato.
            </li>
            <li>
              <strong>Organizar la relación comercial en nuestro CRM</strong> —
              interés legítimo en gestionar nuestra actividad de forma ordenada.
            </li>
            <li>
              <strong>Enviarte comunicaciones comerciales</strong> — tu
              consentimiento, que podés retirar cuando quieras.
            </li>
            <li>
              <strong>Cumplir obligaciones fiscales y contables</strong> —
              obligación legal.
            </li>
          </ul>
          <p>
            No tomamos decisiones automatizadas que produzcan efectos jurídicos
            sobre vos ni te perfilamos con ese fin.
          </p>
        </section>

        <section>
          <h2>4. Conversaciones de WhatsApp: cómo funciona</h2>
          <p>
            Cuando nos escribís por WhatsApp, tu mensaje llega a nuestro sistema
            de gestión de conversaciones, donde queda registrado para poder
            atenderte, retomar la conversación más adelante y no pedirte dos
            veces la misma información.
          </p>
          <ul>
            <li>
              El contenido de los mensajes lo conservamos nosotros. WhatsApp
              aplica cifrado de extremo a extremo en tránsito, pero una vez que
              el mensaje llega a nuestro sistema, somos nosotros quienes lo
              custodiamos.
            </li>
            <li>
              Podemos usar herramientas de asistencia automática para redactar o
              sugerir respuestas. Siempre hay una persona detrás de la
              conversación.
            </li>
            <li>
              No usamos los datos que Meta nos proporciona sobre vos para nada
              que no sea intercambiar mensajes con vos.
            </li>
            <li>
              No compartimos tus conversaciones con terceros ajenos a la
              prestación del servicio.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Con quién los compartimos</h2>
          <p>
            Trabajamos con proveedores que tratan datos por cuenta nuestra, bajo
            contrato de encargo de tratamiento:
          </p>
          <ul>
            <li>
              <strong>Meta Platforms Ireland Ltd.</strong> — Plataforma de
              WhatsApp Business.
            </li>
            <li>
              <strong>Supabase</strong> — base de datos del sistema de gestión de
              conversaciones.
            </li>
            <li>
              <strong>Vercel Inc.</strong> — alojamiento de la aplicación
              (Estados Unidos).
            </li>
          </ul>
          <p>
            Algunos de estos proveedores están fuera del Espacio Económico
            Europeo. En esos casos las transferencias se amparan en las
            Cláusulas Contractuales Tipo aprobadas por la Comisión Europea o en
            decisiones de adecuación vigentes.
          </p>
          <p>
            <strong>Transferencias entre España y Argentina.</strong> Prestamos
            servicios a clientes en ambos países, por lo que tus datos pueden
            tratarse en uno u otro. La Comisión Europea reconoce a Argentina
            como país con nivel de protección adecuado (Decisión 2003/490/CE), de
            modo que estos flujos no requieren garantías adicionales.
          </p>
          <p>
            Además, podemos comunicar datos a la Administración cuando exista
            obligación legal. <strong>No vendemos tus datos a nadie.</strong>
          </p>
        </section>

        <section>
          <h2>6. Cuánto tiempo los conservamos</h2>
          <ul>
            <li>
              <strong>Consultas que no derivan en contratación:</strong> hasta 2
              años desde el último contacto.
            </li>
            <li>
              <strong>Conversaciones de clientes:</strong> durante la relación
              comercial y 5 años después, por posibles reclamaciones.
            </li>
            <li>
              <strong>Datos fiscales y de facturación:</strong> 6 años conforme
              al Código de Comercio español y 10 años cuando resulte aplicable la
              normativa contable argentina. Aplicamos el plazo mayor que nos
              obligue.
            </li>
            <li>
              <strong>Datos para comunicaciones comerciales:</strong> hasta que
              retires tu consentimiento.
            </li>
          </ul>
          <p>
            Cumplidos esos plazos, los eliminamos o los anonimizamos.
          </p>
        </section>

        <section>
          <h2>7. Tus derechos</h2>
          <p>
            Podés ejercer en cualquier momento tus derechos de acceso,
            rectificación, supresión, oposición, limitación del tratamiento y
            portabilidad, así como retirar tu consentimiento. Escribinos a{' '}
            <a
              className="underline underline-offset-4"
              href="mailto:motibhub@gmail.com"
            >
              motibhub@gmail.com
            </a>{' '}
            indicando qué derecho querés ejercer. Te responderemos en el plazo
            máximo de un mes. Podemos pedirte que acredites tu identidad.
          </p>
          <p>
            Si considerás que no atendimos tu solicitud correctamente, podés
            reclamar ante la autoridad de control que te corresponda:
          </p>
          <ul>
            <li>
              <strong>España y resto de la Unión Europea:</strong> Agencia
              Española de Protección de Datos —{' '}
              <a className="underline underline-offset-4" href="https://www.aepd.es">
                www.aepd.es
              </a>
            </li>
            <li>
              <strong>Argentina:</strong> Agencia de Acceso a la Información
              Pública —{' '}
              <a
                className="underline underline-offset-4"
                href="https://www.argentina.gob.ar/aaip"
              >
                argentina.gob.ar/aaip
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Cómo protegemos tus datos</h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables: cifrado en
            tránsito, control de acceso por usuario, credenciales almacenadas
            cifradas y copias de seguridad. Ningún sistema es completamente
            inviolable, pero tratamos tus datos con el mismo cuidado con el que
            querríamos que trataran los nuestros.
          </p>
          <p>
            Si se produjera una brecha de seguridad que suponga un riesgo alto
            para tus derechos, te lo comunicaremos y lo notificaremos a la
            autoridad de control en los plazos legales.
          </p>
        </section>

        <section>
          <h2>9. Menores</h2>
          <p>
            Nuestros servicios están dirigidos a empresas y profesionales. No
            recogemos deliberadamente datos de menores de 14 años. Si detectás
            que esto ha ocurrido, escribinos y los eliminaremos.
          </p>
        </section>

        <section>
          <h2>10. Cambios en esta política</h2>
          <p>
            Si modificamos esta política, actualizaremos la fecha del encabezado
            y publicaremos la versión nueva en esta misma dirección. Si el
            cambio es sustancial, te lo comunicaremos por los medios de contacto
            que tengamos.
          </p>
        </section>
      </div>
    </main>
  )
}
