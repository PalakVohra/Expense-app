import { Response } from "express";
import prisma from "../prisma";
import { AuthenticatedRequest } from "../middleware/auth";

export async function listGroups(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Find all groups where user is a member
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    });

    const groups = memberships.map((m) => m.group);
    return res.json(groups);
  } catch (err: any) {
    console.error("ListGroups Error:", err);
    return res.status(500).json({ error: "Server error listing groups." });
  }
}

export async function createGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Group name is required." });
    }

    const group = await prisma.group.create({
      data: {
        name,
        description,
        members: {
          create: {
            userId,
            joinedAt: new Date(),
            role: "ADMIN",
          },
        },
      },
    });

    return res.status(201).json(group);
  } catch (err: any) {
    console.error("CreateGroup Error:", err);
    return res.status(500).json({ error: "Server error creating group." });
  }
}

export async function getGroupDetails(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify user belongs to group
    const isMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!isMember) {
      return res.status(403).json({ error: "Access denied. You are not a member of this group." });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { user: { name: "asc" } },
        },
        expenses: {
          include: {
            paidBy: { select: { id: true, name: true, email: true } },
            splits: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
          orderBy: { date: "desc" },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    return res.json(group);
  } catch (err: any) {
    console.error("GetGroupDetails Error:", err);
    return res.status(500).json({ error: "Server error fetching group details." });
  }
}

export async function addGroupMember(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const { email, name, joinedAt, leftAt, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Member email is required." });
    }

    // 1. Find or create the user
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Auto-create stub user for dynamic membership
      const defaultHash = await prisma.user.findFirst().then((u) => u?.passwordHash || "stubpasswordhash");
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name || email.split("@")[0],
          passwordHash: defaultHash,
        },
      });
    }

    // 2. Check if already member
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: user.id },
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this group." });
    }

    // 3. Create membership
    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: user.id,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
        leftAt: leftAt ? new Date(leftAt) : null,
        role: role || "MEMBER",
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json(newMember);
  } catch (err: any) {
    console.error("AddGroupMember Error:", err);
    return res.status(500).json({ error: "Server error adding member." });
  }
}

export async function updateGroupMember(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId, memberId } = req.params; // memberId is the GroupMember row id
    const { joinedAt, leftAt, role } = req.body;

    const updated = await prisma.groupMember.update({
      where: { id: memberId },
      data: {
        joinedAt: joinedAt ? new Date(joinedAt) : undefined,
        leftAt: leftAt !== undefined ? (leftAt ? new Date(leftAt) : null) : undefined,
        role: role || undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("UpdateGroupMember Error:", err);
    return res.status(500).json({ error: "Server error updating member." });
  }
}

export async function deleteGroupMember(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId, memberId } = req.params;

    // Delete the group member row
    await prisma.groupMember.delete({
      where: { id: memberId },
    });

    return res.json({ message: "Member removed from group successfully." });
  } catch (err: any) {
    console.error("DeleteGroupMember Error:", err);
    return res.status(500).json({ error: "Server error removing member." });
  }
}
