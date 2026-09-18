import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductDetail } from '@/lib/api-server';
import ProductDetailClient from '@/components/product/ProductDetailClient';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pid: string; vid?: string }>;
}): Promise<Metadata> {
  const { pid } = await params;
  return { title: `Product ${pid}` };
}

export default async function ProductVariantPage({
  params,
}: {
  params: Promise<{ pid: string; vid: string }>;
}) {
  const { pid, vid } = await params;
  let data;
  try {
    data = await getProductDetail(pid, vid);
  } catch {
    data = null;
  }
  if (!data?.success || !data.product) notFound();
  return <ProductDetailClient initial={data} />;
}
