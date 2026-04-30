import { adminApi } from '../adminApi';

interface UserCompanyAccessItem {
  userId: string;
  companyId: string;
  roleId: string;
  role?: { id: string; name: string; permissions: string[] };
  company?: { id: string; name: string; slug: string };
}

interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  image?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  activeCompanyId?: string;
  companyAccess?: UserCompanyAccessItem[];
  createdAt: string | Date;
  updatedAt?: string | Date;
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

    createUser: builder.mutation<User, Partial<User> & { password: string }>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'User', id },
        { type: 'User', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetUsersQuery, useCreateUserMutation, useUpdateUserMutation } = usersApi;
