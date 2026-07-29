-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('PUBLIC', 'PRIVATE', 'INTERNATIONAL', 'RESIDENTIAL', 'GOVERNMENT_AIDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'PROFESSIONAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoUrl" TEXT,
    "type" "SchoolType" NOT NULL,
    "yearEstablished" INTEGER,
    "managingOrganization" TEXT,
    "principalName" TEXT,
    "chairmanName" TEXT,
    "tagline" TEXT,
    "website" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "state" TEXT,
    "district" TEXT,
    "city" TEXT,
    "landmark" TEXT,
    "fullAddress" TEXT,
    "pincode" TEXT,
    "googleMapsUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "campusArea" TEXT,
    "playground" TEXT,
    "sportsFacilities" TEXT[],
    "hasSwimmingPool" BOOLEAN NOT NULL DEFAULT false,
    "hasIndoorSportsArena" BOOLEAN NOT NULL DEFAULT false,
    "sportsInstructor" TEXT,
    "totalStudents" INTEGER,
    "boysCount" INTEGER,
    "girlsCount" INTEGER,
    "boysEnrolled" INTEGER,
    "girlsEnrolled" INTEGER,
    "campusPhotos" TEXT[],
    "eventPhotos" TEXT[],
    "sportsEventPhotos" TEXT[],
    "videos" TEXT[],
    "virtualTourUrl" TEXT,
    "bestSchoolAwards" TEXT[],
    "governmentRecognitions" TEXT[],
    "accreditationDetails" TEXT[],
    "rankings" TEXT[],
    "certifications" TEXT[],

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "state" TEXT,
    "district" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "sportsInterested" TEXT[],
    "schoolId" TEXT,
    "presentClass" INTEGER,
    "company" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_code_key" ON "School"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
