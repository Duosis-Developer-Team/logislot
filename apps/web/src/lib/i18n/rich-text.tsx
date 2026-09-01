import { Fragment, type ReactNode } from "react";

/**
 * Hukuki metinlerde satir ici vurgu.
 *
 * KVKK ve cerez metinleri uzun paragraflardan olusur ve icinde kalin yazilan
 * parcalar vardir. Her paragrafi lead/strong/tail diye ucer anahtara bolmek
 * hem sozlugu okunmaz hale getirir hem de cevirmeni Turkce cumle sirasina
 * mahkum eder. Bunun yerine paragraf TEK anahtarda durur ve vurgu `**...**`
 * ile isaretlenir; ceviren kelime sirasini serbestce degistirebilir.
 */
export function emphasise(text: string): ReactNode {
  return text.split("**").map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index}>{part}</strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
