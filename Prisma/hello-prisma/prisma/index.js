import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async () => {
    // const user = await prisma.user.create({
    //     data: {
    //         email: "dsaq@example.com",
    //         name: "Pratik More"
    //     }
    // });
    // console.log(user);


    // const multiUsers=await prisma.user.createMany({
    //     data:[
    //         {email:"ne2w@example.com", name:"Alice"},
    //         {email:"n3ew2@example.com", name:"Bob"}
    //     ],
    //     skipDuplicates: true
    // })
    //   console.log(multiUsers)

    //   const deletedUser=await prisma.user.delete({
    //     where:{
    //         email:"dsa@example.com"
    //     }
    //   })
    //      console.log(deletedUser)

    const findUser=await prisma.user.findFirst({
        where:{email:"n3ew2@example.com"}
    })
    console.log(findUser)

    // const findAllUsers=await prisma.user.findMany();
    // console.log(findAllUsers);

    const updateUser=await prisma.user.update({
        where:{email:"n3ew2@example.com"},
        data:{name:"bobby"}
        
    })
}

main().catch((e) => {
    console.error(e);
}).finally(async () => {
    await prisma.$disconnect();
});