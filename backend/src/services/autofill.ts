import prisma from '../lib/prisma.js';
import type { ImportedProfile } from './parse-gemini.js';

interface ImportedFileInfo {
  resumeUrl?: string;
  resumeFileName: string;
}

export async function autoFill(userId: string, resumeInfo: ImportedProfile, fileInfo?: ImportedFileInfo){
    return prisma.$transaction(async (tx) => {
        const personalInfo = {
            ...(resumeInfo.profile.headline !== null ? { headline: resumeInfo.profile.headline }: {}),
            ...(resumeInfo.profile.phone !== null ? { phone: resumeInfo.profile.phone }: {}),
            ...(resumeInfo.profile.location !== null ? { location: resumeInfo.profile.location }: {}),
            ...(resumeInfo.profile.summary !== null ? { summary: resumeInfo.profile.summary }: {}),
            ...(resumeInfo.profile.linkedin !== null ? { linkedin: resumeInfo.profile.linkedin }: {}),
            ...(resumeInfo.profile.github !== null ? { github: resumeInfo.profile.github }: {}),
            ...(resumeInfo.profile.portfolio !== null ? { portfolio: resumeInfo.profile.portfolio }: {}),
            ...(fileInfo?.resumeUrl ? { resumeUrl: fileInfo.resumeUrl} : {}),
            ...(fileInfo?.resumeFileName ? { resumeFileName: fileInfo.resumeFileName} : {})
        };

        const profile = await tx.profile.upsert({where: {userId}, update: personalInfo, create: {userId,...personalInfo,},});
        const lastSection = await tx.profileSection.findFirst({ where: {profileId: profile.id}, orderBy: { order: 'desc' },});
        let next = (lastSection?.order ?? -1) + 1;

        for(const i of resumeInfo.sections){
            let section = await tx.profileSection.findFirst({
                where: {
                    profileId: profile.id,
                    type: i.type,
                },
                orderBy: {
                    order: 'asc',
                },

            });

            if(!section){
                section = await tx.profileSection.create({data: {profileId: profile.id, type: i.type, label: i.label, order: next++},});
            }

            const last = await tx.profileInstance.findFirst({where: {sectionId: section.id}, orderBy: {order: 'desc'}});
            let next2 = (last?.order ?? -1) + 1;

            for(const j of i.instances){
                await tx.profileInstance.create({data: {sectionId: section.id, data: j.data, order: next2++}});
            }

        }

        return tx.profile.findUniqueOrThrow({
        where: { userId },
        include: {
            sections: {
            orderBy: { order: 'asc' },
            include: {
                instances: {
                orderBy: { order: 'asc' },
                },
            },
            },
        },
        });


    })
    
}