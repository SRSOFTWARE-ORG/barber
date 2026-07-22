import corteImg from '@/assets/service-corte.jpg';
import barbaImg from '@/assets/service-barba.jpg';
import corteBarbaImg from '@/assets/service-corte-barba.jpg';
import sobrancelhaImg from '@/assets/service-sobrancelha.jpg';
import quimicaImg from '@/assets/service-quimica.jpg';
import defaultImg from '@/assets/service-default.jpg';
import pezinhoImg from '@/assets/service-pezinho.jpg';
import freestyleImg from '@/assets/service-freestyle.jpg';
import pigmentacaoImg from '@/assets/service-pigmentacao.jpg';
import reflexoImg from '@/assets/service-reflexo.jpg';
import colorimetriaImg from '@/assets/service-colorimetria.jpg';

export interface PredefinedServicePhoto {
  key: string;
  label: string;
  url: string;
}

/** Fotos pré-definidas (geradas por IA) que todos os barbeiros podem usar. */
export const PREDEFINED_SERVICE_PHOTOS: PredefinedServicePhoto[] = [
  { key: 'corte', label: 'Corte de cabelo', url: corteImg },
  { key: 'barba', label: 'Barba', url: barbaImg },
  { key: 'corte-barba', label: 'Corte & barba', url: corteBarbaImg },
  { key: 'pezinho', label: 'Pezinho', url: pezinhoImg },
  { key: 'freestyle', label: 'Freestyle (desenho)', url: freestyleImg },
  { key: 'sobrancelha', label: 'Sobrancelha', url: sobrancelhaImg },
  { key: 'pigmentacao', label: 'Pigmentação (cabelo preto)', url: pigmentacaoImg },
  { key: 'reflexo', label: 'Reflexo / luzes', url: reflexoImg },
  { key: 'colorimetria', label: 'Colorimetria (cabelo colorido)', url: colorimetriaImg },
  { key: 'quimica', label: 'Química / descoloração', url: quimicaImg },
  { key: 'default', label: 'Geral', url: defaultImg },
];

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Escolhe a foto pré-definida com base no nome do serviço.
 * Esta é a imagem padrão que o app adiciona automaticamente.
 * A ordem das verificações importa: do mais específico para o mais genérico.
 */
export function getDefaultServicePhoto(name: string): string {
  const n = norm(name);

  // Colorimetria: cabelo totalmente colorido (outra cor que não branco)
  if (/(colorimetr|colora)/.test(n)) return colorimetriaImg;
  // Reflexo / luzes / mechas: apenas algumas partes do cabelo pintadas
  if (/(reflexo|luzes|luz|mechas|mecha)/.test(n)) return reflexoImg;
  // Pigmentação: cabelo/barba preto
  if (/(pigment)/.test(n)) return pigmentacaoImg;
  // Outras químicas: nevou (platinado), descoloração, progressiva, alisamento, botox
  if (/(quimic|nevou|platinad|descolora|progressiv|alisa|relaxa|botox)/.test(n)) return quimicaImg;
  // Freestyle: desenhos no cabelo
  if (/(freestyle|desenho|risco|tribal)/.test(n)) return freestyleImg;
  // Pezinho: acabamento da nuca
  if (/(pezinho|pe zinho|acabamento|contorno)/.test(n)) return pezinhoImg;
  // Sobrancelha (inclui erros de grafia comuns)
  if (/(sobrancelha|sombracelha|sombraselha|sombrancelha|sobramcelha|design)/.test(n)) return sobrancelhaImg;

  const hasCorte = /(corte|cabelo|degrade|fade|maquina|tesoura|estilo|social|americano|infantil|navalhad|disfarc)/.test(n);
  const hasBarba = /(barba|cavanhaque|bigode|navalha)/.test(n);
  if (hasCorte && hasBarba) return corteBarbaImg;
  if (hasBarba) return barbaImg;
  if (hasCorte) return corteImg;

  return defaultImg;
}

/** Foto efetiva a exibir: a do barbeiro se existir, senão a pré-definida. */
export function getServicePhoto(name: string, fotoUrl?: string | null): string {
  return fotoUrl && fotoUrl.trim() ? fotoUrl : getDefaultServicePhoto(name);
}
