import { adminApi } from '../adminApi';

interface Role {
  id: string;
  name: string;
  slug: string;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const rolesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getRoles: builder.query<Role[], void>({
      query: () => '/roles',
      transformResponse: (r: { data: Role[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Role', id: 'LIST' }, ...result.map((role) => ({ type: 'Role' as const, id: role.id }))]
          : [{ type: 'Role', id: 'LIST' }],
    }),

    createRole: builder.mutation<Role, Partial<Role>>({
      query: (body) => ({
        url: '/roles',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Role }) => r.data,
      invalidatesTags: [{ type: 'Role', id: 'LIST' }],
    }),

    updateRole: builder.mutation<Role, { id: string; data: Partial<Role> }>({
      query: ({ id, data }) => ({
        url: `/roles/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Role }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Role', id },
        { type: 'Role', id: 'LIST' },
      ],
    }),

    deleteRole: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/roles/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean }) => r,
      invalidatesTags: (result, error, id) => [
        { type: 'Role', id },
        { type: 'Role', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} = rolesApi;
