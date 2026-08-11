import { redirect } from "next/navigation";

/**
 * Eski "Tesis Dizini" — 1 tenant = 1 tesis kararindan sonra ayri bir tesis
 * kavrami YOK. Rota, kayitli linkler ve yer imleri kirilmasin diye musteri
 * hesaplarina yonlendirir.
 */
export default function FacilitiesRedirect() {
  redirect("/platform/tenants");
}
