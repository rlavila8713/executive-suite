import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { ProductThumb } from '../components/ProductThumb';
import { Product } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';

interface ProductsProps {
  products: Product[];
  globalSearch?: string;
  onAdd: (product: Omit<Product, 'id'>) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<Product>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function Products({ products, globalSearch = '', onAdd, onUpdate, onDelete }: ProductsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productImage, setProductImage] = useState<string>(PLACEHOLDER_PRODUCT_IMAGE);

  useEffect(() => {
    if (!isModalOpen) return;
    setProductImage(editingProduct?.image ?? PLACEHOLDER_PRODUCT_IMAGE);
  }, [isModalOpen, editingProduct]);

  const filteredProducts = products.filter(
    (p) =>
      rowMatchesSearch(searchTerm, [p.name, p.sku, p.category]) &&
      rowMatchesSearch(globalSearch, [p.name, p.sku, p.category]),
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const productData = {
      name,
      sku: formData.get('sku') as string,
      category: formData.get('category') as string,
      price: parseFloat(formData.get('price') as string),
      cost: parseFloat(formData.get('cost') as string),
      stock: parseInt(formData.get('stock') as string, 10),
      image: productImage,
    };

    if (editingProduct) {
      await onUpdate(editingProduct.id, productData);
    } else {
      await onAdd(productData);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">Products Management</h2>
          <p className="text-on-surface-variant text-sm font-medium">
            Photos are stored on this device (embedded in the local database), not loaded from the internet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex items-center gap-2">
            <Filter size={16} /> Filter
          </Button>
          <Button variant="secondary" className="flex items-center gap-2">
            <Download size={16} /> Export
          </Button>
          <Button
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> Add Product
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Total Products</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-primary">{products.length}</span>
            <span className="text-on-tertiary-container text-xs font-bold">+12%</span>
          </div>
        </Card>
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Inventory Value</span>
          <span className="text-3xl font-extrabold text-primary">
            ${products.reduce((acc, p) => acc + p.price * p.stock, 0).toLocaleString()}
          </span>
        </Card>
        <Card className="h-32 flex flex-col justify-between hover:shadow-xl transition-all">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Low Stock Alerts</span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-extrabold text-error">{products.filter((p) => p.stock <= 5).length}</span>
            <AlertCircle className="text-error" size={20} />
          </div>
        </Card>
        <div className="bg-primary p-6 rounded-xl flex flex-col justify-between h-32 text-white shadow-lg">
          <span className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Average Margin</span>
          <span className="text-3xl font-extrabold">64.2%</span>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-surface-container-low">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder="Search products..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  Product Name
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  Category
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  Price
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-center">
                  Stock Status
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <ProductThumb
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                      <div>
                        <p className="font-bold text-primary">{product.name}</p>
                        <p className="text-xs text-on-surface-variant">SKU: {product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{product.category}</td>
                  <td className="py-4 px-6 text-right text-sm font-bold text-primary">${product.price.toFixed(2)}</td>
                  <td className="py-4 px-6 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        product.stock > 10
                          ? 'bg-tertiary-container/10 text-on-tertiary-container'
                          : product.stock > 0
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-high text-on-surface-variant',
                      )}
                    >
                      {product.stock > 10
                        ? `In Stock (${product.stock})`
                        : product.stock > 0
                          ? `Low Stock (${product.stock})`
                          : 'Out of Stock'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingProduct(product);
                          setIsModalOpen(true);
                        }}
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:bg-error/10"
                        onClick={() => onDelete(product.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-6 flex justify-between items-center bg-surface-container-low border-t border-black/5">
          <span className="text-xs text-on-surface-variant font-medium">Showing {filteredProducts.length} entries</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm">
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" className="w-8 h-8 p-0">
              1
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
              2
            </Button>
            <Button variant="ghost" size="sm">
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
      >
        <form key={editingProduct?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          <ImagePicker
            value={productImage}
            onChange={setProductImage}
            label="Product image"
            helperText="Uses your operating system file dialog. Images are saved as data in the local database (keep files under ~2.5 MB)."
            compact
          />
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Product Name</label>
            <Input name="name" defaultValue={editingProduct?.name} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">SKU</label>
              <Input name="sku" defaultValue={editingProduct?.sku} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Category</label>
              <Input name="category" defaultValue={editingProduct?.category} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Price</label>
              <Input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Cost</label>
              <Input name="cost" type="number" step="0.01" defaultValue={editingProduct?.cost} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Stock</label>
              <Input name="stock" type="number" defaultValue={editingProduct?.stock} required />
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Save Product
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
