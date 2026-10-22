import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})
async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.SHOP_NAME
  if (!email || !password || password.length < 10 || !name)
    throw new Error(
      'Informe ADMIN_EMAIL, ADMIN_PASSWORD (10+ caracteres) e SHOP_NAME para provisionar o salão',
    )
  const existing = await prisma.admin.findUnique({ where: { email } })
  if (!existing)
    await prisma.admin.create({
      data: {
        name: process.env.ADMIN_NAME || 'Administrador',
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'OWNER',
      },
    })
  for (const [key, value] of Object.entries({
    shop_name: name,
    shop_phone: process.env.SHOP_PHONE || '',
    shop_address: process.env.SHOP_ADDRESS || '',
    shop_instagram: process.env.SHOP_INSTAGRAM || '',
  })) {
    await prisma.settings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }
  console.log(
    'Salão provisionado. Serviços, profissionais e acessos podem ser cadastrados no painel.',
  )
}
main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
