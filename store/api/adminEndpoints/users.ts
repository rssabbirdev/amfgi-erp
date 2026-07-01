import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { adminApi } from '../adminApi';

export const USER_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export type UsersListParams = {
  limit: number;
  offset: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  tab?: 'erp' | 'self-service';
  companyId?: string;
};

export type UsersListResponse = {
  items: User[];
  total: number;
};

export interface UserCompanyAccessItem {
  userId: string;
  companyId: string;
  roleId: string;
  role?: { id: string; name: string; permissions: string[] };
  company?: { id: string; name: string; slug: string };
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  image?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  activeCompanyId?: string;
  /** When set, this login is the employee self-service portal user for HR. */
  linkedEmployeeId?: string | null;
  companyAccess?: UserCompanyAccessItem[];
  createdAt: string | Date;
  updatedAt?: string | Date;
}

function applyUserDraftPatch(row: User, data: Partial<User> & Record<string, unknown>) {
  if (data.name !== undefined) row.name = data.name as string;
  if (data.isSuperAdmin !== undefined) row.isSuperAdmin = data.isSuperAdmin as boolean;
  if (data.isActive !== undefined) row.isActive = data.isActive as boolean;
  if (data.companyAccess !== undefined) {
    row.companyAccess = data.companyAccess as User['companyAccess'];
  }
}

export const usersApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      transformResponse: (r: { data: User[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'User', id: 'LIST' }, ...result.map((user) => ({ type: 'User' as const, id: user.id }))]
          : [{ type: 'User', id: 'LIST' }],
    }),

    getUsersPage: builder.query<UsersListResponse, UsersListParams>({
      query: ({ limit, offset, search, status, tab, companyId }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        if (status && status !== 'all') params.set('status', status);
        if (tab) params.set('tab', tab);
        if (companyId && companyId !== 'all') params.set('companyId', companyId);
        return `/users?${params.toString()}`;
      },
      transformResponse: (r: { data: UsersListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'User', id: 'LIST' },
              ...result.items.map((user) => ({ type: 'User' as const, id: user.id })),
            ]
          : [{ type: 'User', id: 'LIST' }],
    }),

    createUser: builder.mutation<User, Partial<User> & { password: string }>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: created } = await queryFulfilled;
          dispatch(
            usersApi.util.updateQueryData('getUsers', undefined, (draft) => {
              if (!draft.some((u) => u.id === created.id)) draft.unshift(created);
            }),
          );
        } catch {
          /* mutation failed — no cache change */
        }
      },
    }),

    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [],
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          usersApi.util.updateQueryData('getUsers', undefined, (draft) => {
            const row = draft.find((u) => u.id === id);
            if (row) applyUserDraftPatch(row, data);
          }),
        );
        try {
          const { data: serverUser } = await queryFulfilled;
          dispatch(
            usersApi.util.updateQueryData('getUsers', undefined, (draft) => {
              const idx = draft.findIndex((u) => u.id === id);
              if (idx !== -1) draft[idx] = serverUser;
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),

    deleteUser: builder.mutation<{ deleted: boolean; permanent?: boolean }, string>({
      query: (id) => ({
        url: `/users/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean; permanent?: boolean } }) => r.data,
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUsersPageQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi;
