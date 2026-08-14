import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUniqueItemSlug, slugifyMarketHashName } from './item-slug.util';

@Injectable()
export class ItemSlugBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ItemSlugBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingSlugs();
  }

  async backfillMissingSlugs(): Promise<number> {
    const missing = await this.prisma.itemDefinition.findMany({
      where: { slug: null },
      select: { id: true, marketHashName: true },
      orderBy: { marketHashName: 'asc' },
    });

    if (missing.length === 0) {
      return 0;
    }

    const existing = await this.prisma.itemDefinition.findMany({
      where: { slug: { not: null } },
      select: { slug: true },
    });
    const reserved = new Set(
      existing.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)),
    );

    let updated = 0;
    for (const item of missing) {
      const slug = resolveUniqueItemSlug(item.marketHashName, reserved);
      reserved.add(slug);
      await this.prisma.itemDefinition.update({
        where: { id: item.id },
        data: { slug },
      });
      updated += 1;
    }

    this.logger.log(`Backfilled ${updated} item slug(s)`);
    return updated;
  }
}

export function slugForMarketHashName(
  marketHashName: string,
  reserved?: ReadonlySet<string>,
): string {
  if (!reserved) {
    return slugifyMarketHashName(marketHashName);
  }
  return resolveUniqueItemSlug(marketHashName, reserved);
}
